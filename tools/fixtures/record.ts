import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Frame, type Page } from '@playwright/test';
import { FORMS, type FormFixture } from '../../e2e/forms.ts';
import { harSchema, type HarContent, type HarEntry } from './har.ts';
import { collectSecrets, keepEntry, redact, scrubEntry, textOf } from './scrub.ts';

// Records a live, public Application Form as a replayable fixture:
//   fixtures/<ats>/<employer>-<date>.har   the page's own requests (GETs, plus Ashby's read queries)
//   fixtures/<ats>/har/<sha1>.<ext>        response bodies, shared between that ATS's fixtures
//   fixtures/<ats>/<employer>-<date>.html  the rendered DOM, for unit tests
// It only loads pages and types into autocomplete boxes. It never clicks
// anything and never submits (CLAUDE.md "Hard rules").
//
//   node tools/fixtures/record.ts greenhouse/anthropic-2026-10-27 [more names...]
//   node tools/fixtures/record.ts --all

const ROOT = path.resolve(import.meta.dirname, '../..');
const FIXTURES = path.join(ROOT, 'fixtures');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const forms = args.includes('--all') ? FORMS : FORMS.filter((form) => args.includes(form.name));
  if (forms.length === 0) {
    process.stderr.write(`Name one or more of:\n${FORMS.map((f) => `  ${f.name}`).join('\n')}\nor pass --all.\n`);
    process.exitCode = 1;
    return;
  }
  for (const form of forms) {
    const summary = await recordForm(form);
    process.stdout.write(`${form.name}: ${summary}\n`);
  }
  for (const dir of new Set(forms.map((form) => path.join(FIXTURES, path.dirname(form.name))))) {
    const removed = await pruneBodies(dir);
    if (removed > 0) process.stdout.write(`${path.relative(ROOT, dir)}: removed ${removed} bodies no HAR uses\n`);
  }
}

/** Deletes stored bodies that no HAR in the directory refers to any more (left by re-recording). */
async function pruneBodies(dir: string): Promise<number> {
  const used = new Set<string>();
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.har')) continue;
    const har = harSchema.parse(JSON.parse(await readFile(path.join(dir, name), 'utf8')));
    for (const entry of har.log.entries) {
      const file = entry.response.content._file;
      if (file !== undefined) used.add(path.basename(file));
    }
  }
  let removed = 0;
  for (const body of await readdir(path.join(dir, 'har'))) {
    if (used.has(body)) continue;
    await rm(path.join(dir, 'har', body));
    removed++;
  }
  return removed;
}

async function recordForm(form: FormFixture): Promise<string> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'employ-me-record-'));
  const rawHar = path.join(scratch, 'raw.har');
  const browser = await chromium.launch({ channel: 'chromium' });
  let html: string;
  try {
    const context = await browser.newContext({
      recordHar: { path: rawHar, mode: 'full', content: 'embed' },
      serviceWorkers: 'block',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/Toronto',
    });
    const page = await context.newPage();
    await page.goto(form.url, { waitUntil: 'load', timeout: 60_000 });
    const frame = await formFrameOf(page, form);
    await frame.waitForSelector('input:not([type="hidden"]), textarea, select', { timeout: 30_000 });
    await page.waitForTimeout(6_000);
    html = await frame.content();
    for (const typing of form.typing ?? []) {
      const box = frame.locator(typing.selector).first();
      if ((await box.count()) === 0) continue;
      if (typing.keystrokes === true) await box.pressSequentially(typing.text);
      else await box.fill(typing.text);
      await page.waitForTimeout(3_000);
      await box.fill('');
      await page.waitForTimeout(500);
    }
    await context.close();
  } finally {
    await browser.close();
  }

  const har = harSchema.parse(JSON.parse(await readFile(rawHar, 'utf8')));
  await rm(scratch, { recursive: true, force: true });

  const kept = har.log.entries.filter((entry) => keepEntry(entry, form));
  const secrets = collectSecrets(har.log.entries, [html]);
  const dir = path.join(FIXTURES, path.dirname(form.name));
  await mkdir(path.join(dir, 'har'), { recursive: true });

  const entries: HarEntry[] = [];
  for (const entry of kept) {
    const scrubbed = scrubEntry(entry, secrets);
    entries.push({
      ...scrubbed,
      response: { ...scrubbed.response, content: await storeBody(dir, scrubbed.response.content) },
    });
  }
  const out = { log: { ...har.log, pages: har.log.pages ?? [], entries } };
  await writeFile(path.join(FIXTURES, `${form.name}.har`), `${JSON.stringify(out, null, 1)}\n`);
  await writeFile(path.join(FIXTURES, `${form.name}.html`), redact(html, secrets));
  return `kept ${entries.length} of ${har.log.entries.length} requests, redacted ${secrets.length} secrets`;
}

async function formFrameOf(page: Page, form: FormFixture): Promise<Frame> {
  const match = form.formFrame;
  if (match === undefined) return page.mainFrame();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => f.url().includes(match));
    if (frame !== undefined) return frame;
    await page.waitForTimeout(250);
  }
  throw new Error(`${form.name}: no frame matching ${match}`);
}

/** Moves a body into the ATS's shared store, named by its hash, so fixtures share bundles. */
async function storeBody(dir: string, content: HarContent): Promise<HarContent> {
  if (content.text === undefined) return content;
  const text = textOf(content);
  const bytes =
    text !== null
      ? Buffer.from(text, 'utf8')
      : Buffer.from(content.text, content.encoding === 'base64' ? 'base64' : 'utf8');
  const name = `${createHash('sha1').update(bytes).digest('hex')}.${extensionOf(content.mimeType ?? '')}`;
  await writeFile(path.join(dir, 'har', name), bytes);
  return { size: bytes.length, mimeType: content.mimeType ?? '', _file: `har/${name}` };
}

function extensionOf(mimeType: string): string {
  if (mimeType.includes('html')) return 'html';
  if (mimeType.includes('css')) return 'css';
  if (mimeType.includes('javascript')) return 'js';
  if (mimeType.includes('json')) return 'json';
  if (mimeType.includes('svg')) return 'svg';
  return 'bin';
}

await main();
