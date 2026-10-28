import { execFile } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';

// The e2e harness: real Chromium, the built extension loaded unpacked, and
// real ATS URLs served from fixtures/ so content-script match patterns apply.
// Every http(s) request that no test serves is aborted: tests never touch the
// real network. See CLAUDE.md "End-to-end tests".

const ROOT = path.resolve(import.meta.dirname, '..');
export const EXTENSION_DIR = path.join(ROOT, 'packages/extension/.output/chrome-mv3');
export const FIXTURES_DIR = path.join(ROOT, 'fixtures');
const HELPER_CLI = path.join(ROOT, 'packages/helper/dist/cli.mjs');

export type DashboardRoute = 'profile' | 'saved-answers' | 'tracker' | 'settings';

/** The content script's answer to a ping (packages/extension/src/messaging/content.ts). */
export interface Pong {
  readonly type: 'pong';
  readonly ats: string;
  readonly url: string;
  readonly topFrame: boolean;
}

export interface Sites {
  /**
   * Serve fixtures/<fixture> whenever the browser requests `url`. A string
   * without `*` matches that exact URL (query included); otherwise it is a
   * Playwright glob.
   */
  serve(url: string | RegExp, fixture: string): Promise<void>;
  /** http(s) requests nothing served. They were aborted. */
  readonly blocked: readonly string[];
}

export interface Extension {
  readonly id: string;
  readonly serviceWorker: Worker;
  /**
   * Opens sidepanel.html in a tab. Playwright can't open Chrome's real side
   * panel, so the page gets `?tabId=` for the tab it should work on.
   */
  openSidePanel(options?: { forPage?: Page }): Promise<Page>;
  openDashboard(route?: DashboardRoute): Promise<Page>;
  /** Chrome's tab id for a page on a host the extension has permission for. */
  tabIdOf(page: Page): Promise<number>;
  /** Pings the content script in every tab and returns every answer. */
  pingContentScripts(): Promise<Pong[]>;
  /** Console errors and uncaught exceptions from extension pages and the service worker. */
  readonly errors: readonly string[];
}

interface Fixtures {
  userDataDir: string;
  context: BrowserContext;
  sites: Sites;
  extension: Extension;
}

interface Options {
  /**
   * `test.use({ helper: 'fake' })` installs the real helper, with the fake
   * Provider forced on, into this test's browser profile, so the extension
   * talks to it over Native Messaging. Any other HelperErrorReason makes
   * every fake Provider call fail with it. Off by default: no helper at all.
   */
  helper: 'none' | 'fake' | `fail:${string}`;
}

// Just enough of chrome.* for the harness. Used only inside evaluate()
// callbacks, which run in the extension's service worker.
interface ChromeForHarness {
  tabs: {
    query(filter: object): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
}

export const test = base.extend<Fixtures & Options>({
  helper: ['none', { option: true }],

  // A fresh profile per test. With a helper, its host manifest goes into
  // `${userDataDir}/NativeMessagingHosts/` before the context starts.
  userDataDir: async ({ helper }, use) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'employ-me-e2e-'));
    if (helper !== 'none') {
      const fail = helper.startsWith('fail:') ? ['--fail', helper.slice('fail:'.length)] : [];
      await promisify(execFile)(process.execPath, [
        HELPER_CLI,
        'install-test-host',
        '--user-data-dir',
        dir,
        ...fail,
      ]);
    }
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },

  context: async ({ userDataDir }, use, testInfo) => {
    await access(path.join(EXTENSION_DIR, 'manifest.json')).catch(() => {
      throw new Error(`No extension build at ${EXTENSION_DIR}. Run \`pnpm build\` or unset E2E_SKIP_BUILD.`);
    });
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: process.env['HEADED'] !== '1',
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
      // Inherited by the Native Messaging host Chrome starts: e2e never spends the user's plan.
      env: { ...definedEnv(), EMPLOY_ME_PROVIDER: 'fake' },
    });
    const logs: string[] = [];
    context.on('console', (message) => logs.push(`[page ${message.type()}] ${message.text()}`));
    context.on('weberror', (error) => logs.push(`[page error] ${error.error().message}`));
    await context.tracing.start({ screenshots: true, snapshots: true });

    await use(context);

    const failed = testInfo.status !== testInfo.expectedStatus;
    if (failed) {
      await context.tracing.stop({ path: testInfo.outputPath('trace.zip') });
      await testInfo.attach('console.log', { body: logs.join('\n'), contentType: 'text/plain' });
    } else {
      await context.tracing.stop();
    }
    await context.close();
  },

  sites: async ({ context }, use) => {
    const blocked: string[] = [];
    // Registered first so every later route takes precedence over it.
    await context.route(
      (url) => url.protocol === 'http:' || url.protocol === 'https:',
      (route) => {
        const url = route.request().url();
        if (!url.endsWith('/favicon.ico')) blocked.push(url);
        return route.abort('blockedbyclient');
      },
    );
    await use({
      blocked,
      async serve(url, fixture) {
        const file = path.join(FIXTURES_DIR, fixture);
        await access(file);
        const matcher = typeof url === 'string' && !url.includes('*') ? (u: URL) => u.href === url : url;
        await context.route(matcher, (route) => route.fulfill({ path: file }));
      },
    });
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
    context.on('weberror', (error) => {
      if (error.page()?.url().startsWith('chrome-extension://') === true) errors.push(error.error().message);
    });

    const openPage = async (pathAndQuery: string) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${id}/${pathAndQuery}`);
      return page;
    };

    const tabIdOf = async (page: Page) => {
      const tabId = await serviceWorker.evaluate(async (url) => {
        const { chrome } = globalThis as unknown as { chrome: ChromeForHarness };
        const tabs = await chrome.tabs.query({});
        return tabs.find((tab) => tab.url === url)?.id ?? null;
      }, page.url());
      if (tabId === null) throw new Error(`No tab with URL ${page.url()} visible to the extension`);
      return tabId;
    };

    await use({
      id,
      serviceWorker,
      errors,
      tabIdOf,
      async openSidePanel(options = {}) {
        const query = options.forPage === undefined ? '' : `?tabId=${await tabIdOf(options.forPage)}`;
        return openPage(`sidepanel.html${query}`);
      },
      openDashboard: (route = 'profile') => openPage(`dashboard.html#${route}`),
      pingContentScripts: () =>
        serviceWorker.evaluate(async () => {
          const { chrome } = globalThis as unknown as { chrome: ChromeForHarness };
          const tabs = await chrome.tabs.query({});
          // Tabs without our content script reject; that's an expected "no answer".
          const answers = await Promise.all(
            tabs.map((tab) =>
              tab.id === undefined
                ? Promise.resolve(null)
                : chrome.tabs.sendMessage(tab.id, { type: 'ping' }).then(
                    (pong) => pong,
                    () => null,
                  ),
            ),
          );
          return answers.filter((answer) => answer !== null) as Pong[];
        }),
    });
  },
});

export { expect } from '@playwright/test';

function isOurWorker(worker: Worker): boolean {
  return worker.url().startsWith('chrome-extension://') && worker.url().endsWith('/background.js');
}

function definedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
