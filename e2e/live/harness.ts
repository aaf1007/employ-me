import { execFile } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { EXTENSION_DIR } from '../harness';
import { backstop } from './backstop';
import { BUDGET, callsIn, overBudget, record, totalOf, type Calls, type LiveProvider } from './ledger';

// The opt-in live harness (`pnpm test:live`, never CI or test:e2e): the built
// extension on real job sites, with the real helper running your real claude
// or codex (its host manifest goes into the Playwright user-data-dir). It
// spends your plan, so every call is counted in the ledger, and a test is
// stopped as soon as it goes over its own cap.
//
// Nothing can be submitted: the backstop (backstop.ts) aborts every request
// that isn't a read, on every host, and records it. The specs never click
// anything on a job site; only the Fill writes there, through act/.

const ROOT = path.resolve(import.meta.dirname, '../..');
const HELPER_CLI = path.join(ROOT, 'packages/helper/dist/cli.mjs');

export interface Network {
  /** Requests the backstop aborted: every write the page tried. */
  readonly aborted: readonly { method: string; url: string }[];
  /** Ashby GraphQL queries the backstop let through (read-only). */
  readonly readQueries: readonly string[];
}

export interface LiveExtension {
  readonly id: string;
  readonly serviceWorker: Worker;
  openSidePanel(forPage: Page): Promise<Page>;
  openDashboard(route: string): Promise<Page>;
  readonly errors: readonly string[];
}

interface Fixtures {
  userDataDir: string;
  context: BrowserContext;
  network: Network;
  extension: LiveExtension;
  /** The Provider calls this test made so far (from the test host's log). */
  calls: () => Promise<Calls>;
}

interface Options {
  /** `none` runs with no helper at all: the rules alone, no calls. */
  provider: LiveProvider | 'none';
  /** The most real calls this test may make; it is stopped past this. */
  maxCalls: number;
}

const logFileIn = (userDataDir: string) => path.join(userDataDir, 'employ-me-test-host', 'helper.log');

export const test = base.extend<Fixtures & Options>({
  provider: ['none', { option: true }],
  maxCalls: [0, { option: true }],

  userDataDir: async ({ provider, maxCalls }, use, testInfo) => {
    if (provider !== 'none') {
      const why = await overBudget(provider, maxCalls);
      testInfo.skip(why !== null, why ?? '');
    }
    const dir = await mkdtemp(path.join(tmpdir(), 'employ-me-live-'));
    if (provider !== 'none') {
      await promisify(execFile)(process.execPath, [
        HELPER_CLI,
        'install-test-host',
        '--user-data-dir',
        dir,
        '--real',
      ]);
    }
    await use(dir);
    if (provider !== 'none') {
      const calls = await callsIn(logFileIn(dir));
      const ledger = await record(testInfo.title, provider, calls);
      testInfo.annotations.push({
        type: 'calls',
        description: `${provider}: ${totalOf(calls)} this test, ${ledger.spent[provider]} of ${BUDGET} in total`,
      });
    }
    await rm(dir, { recursive: true, force: true });
  },

  calls: async ({ userDataDir }, use) => {
    await use(() => callsIn(logFileIn(userDataDir)));
  },

  context: async ({ userDataDir, provider, maxCalls }, use, testInfo) => {
    await access(path.join(EXTENSION_DIR, 'manifest.json')).catch(() => {
      throw new Error(`No extension build at ${EXTENSION_DIR}. Run \`pnpm build\` or unset E2E_SKIP_BUILD.`);
    });
    const { EMPLOY_ME_PROVIDER: _fake, EMPLOY_ME_FAKE_FAIL: _fail, ...env } = definedEnv();
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: process.env['HEADED'] !== '1',
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
      // No EMPLOY_ME_PROVIDER: the helper Chrome starts runs the real CLIs.
      env,
    });
    const logs: string[] = [];
    context.on('console', (message) => logs.push(`[page ${message.type()}] ${message.text()}`));
    await context.tracing.start({ screenshots: true, snapshots: true });

    // Stops the test, closing Chrome and with it the helper and its CLIs, past its cap.
    const watch =
      provider === 'none'
        ? undefined
        : setInterval(() => {
            void callsIn(logFileIn(userDataDir)).then((calls) => {
              if (totalOf(calls) > maxCalls) {
                logs.push(`[live] over the cap of ${maxCalls} calls: closing`);
                void context.close();
              }
            });
          }, 250);

    await use(context);

    clearInterval(watch);
    const failed = testInfo.status !== testInfo.expectedStatus;
    await context.tracing
      .stop(failed ? { path: testInfo.outputPath('trace.zip') } : {})
      .catch(() => undefined);
    if (failed) await testInfo.attach('console.log', { body: logs.join('\n'), contentType: 'text/plain' });
    await context.close();
  },

  network: async ({ context }, use) => {
    const aborted: { method: string; url: string }[] = [];
    const readQueries: string[] = [];
    await context.route(
      (url) => url.protocol === 'http:' || url.protocol === 'https:',
      (route) => {
        const request = route.request();
        const verdict = backstop(request.method(), request.url(), request.postData());
        if (verdict === 'abort') {
          aborted.push({ method: request.method(), url: withoutQuery(request.url()) });
          return route.abort('blockedbyclient');
        }
        if (verdict === 'readQuery') readQueries.push(new URL(request.url()).searchParams.get('op') ?? '?');
        return route.continue();
      },
    );
    await use({ aborted, readQueries });
  },

  extension: async ({ context }, use) => {
    const serviceWorker =
      context.serviceWorkers().find(isOurWorker) ??
      (await context.waitForEvent('serviceworker', { predicate: isOurWorker }));
    const id = new URL(serviceWorker.url()).host;
    const errors: string[] = [];
    serviceWorker.on('console', (message) => {
      if (message.type() === 'error') errors.push(`[service worker] ${message.text()}`);
    });
    context.on('console', (message) => {
      if (message.type() === 'error' && message.page()?.url().startsWith('chrome-extension://') === true) {
        errors.push(`[${message.page()?.url() ?? ''}] ${message.text()}`);
      }
    });
    const openPage = async (pathAndQuery: string) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${id}/${pathAndQuery}`);
      return page;
    };
    await use({
      id,
      serviceWorker,
      errors,
      openDashboard: (route) => openPage(`dashboard.html#${route}`),
      openSidePanel: async (forPage) =>
        openPage(`sidepanel.html?tabId=${await tabIdOf(serviceWorker, forPage)}`),
    });
  },
});

export { expect } from '@playwright/test';

// Just enough of chrome.* for evaluate() callbacks in the service worker.
interface ChromeForHarness {
  tabs: {
    query(filter: object): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
}

/** Chrome's tab id for a page: by URL, or, for a company site embedding a form, by its content script. */
async function tabIdOf(serviceWorker: Worker, page: Page): Promise<number> {
  // An embedded form's content script may not be up yet: keep asking for a while.
  for (let attempt = 0; attempt < 40; attempt++) {
    const frameUrls = page.frames().map((frame) => frame.url());
    const tabId = await serviceWorker.evaluate(
      async ([url, frames]) => {
        const { chrome } = globalThis as unknown as { chrome: ChromeForHarness };
        const tabs = await chrome.tabs.query({});
        const byUrl = tabs.find((tab) => tab.url === url)?.id;
        if (byUrl !== undefined) return byUrl;
        for (const tab of tabs) {
          if (tab.id === undefined || tab.url !== undefined) continue;
          const pong = (await chrome.tabs.sendMessage(tab.id, { type: 'ping' }).then(
            (answer) => answer,
            () => null,
          )) as { url?: string } | null;
          if (pong?.url === undefined) continue;
          const pinged = new URL(pong.url);
          if (frames.some((frame) => frame.startsWith(`${pinged.origin}${pinged.pathname}`))) return tab.id;
        }
        return null;
      },
      [page.url(), frameUrls] as const,
    );
    if (tabId !== null) return tabId;
    await page.waitForTimeout(500);
  }
  throw new Error(`No tab with URL ${page.url()} visible to the extension`);
}

function isOurWorker(worker: Worker): boolean {
  return worker.url().startsWith('chrome-extension://') && worker.url().endsWith('/background.js');
}

function withoutQuery(url: string): string {
  const parsed = new URL(url);
  const op = parsed.searchParams.get('op');
  return `${parsed.origin}${parsed.pathname}${op === null ? '' : `?op=${op}`}`;
}

function definedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
