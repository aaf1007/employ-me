import type { Frame, Page } from '@playwright/test';
import { countSubmits, submits } from '../panel';
import { expect, test } from './harness';
import type { LiveProvider } from './ledger';
import { POSTINGS, type LivePosting } from './postings';
import { restorePersona } from './profile';
import { fieldReports, runDir, tally, writeRun } from './report';

// One live Fill per Posting (postings.ts), from the persona's Profile, by the
// Posting's own Provider. Nothing is clicked on the job site and nothing is
// submitted; the result goes to .live-runs/<date>/<posting>.<provider>.json.
//
//   LIVE_POSTINGS=gh-affirm,lv-wave   only these
//   LIVE_PROVIDER=none                the rules alone: no helper, no calls
//   LIVE_PROVIDER=claude|codex        every selected Posting on this Provider

/** The persona's own rough answer, from its Resume, for polish mode. */
const POLISH_INPUT =
  'i lead a team of four at fernwood software building our payments api in typescript and go. we cut checkout latency 35% by moving card authorization to a event driven queue on aws, and i run the on call rotation.';

const only = (process.env['LIVE_POSTINGS'] ?? '').split(',').filter((id) => id !== '');
const override = process.env['LIVE_PROVIDER'] as LiveProvider | 'none' | undefined;
const selected = POSTINGS.filter((p) => only.length === 0 || only.includes(p.id));

async function formFrame(page: Page, posting: LivePosting): Promise<Frame> {
  const match = posting.formFrame;
  if (match === undefined) return page.mainFrame();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => f.url().includes(match));
    if (frame !== undefined) return frame;
    await page.waitForTimeout(250);
  }
  throw new Error(`No frame matching ${match} on ${posting.url}`);
}

for (const posting of selected) {
  const provider = override ?? posting.provider;
  test.describe(posting.id, () => {
    test.use({ provider, maxCalls: provider === 'none' ? 0 : posting.maxCalls });

    test(`${posting.id} with ${provider}`, async ({ context, extension, network, calls }) => {
      test.setTimeout(420_000);
      await restorePersona(extension, provider === 'none' ? 'claude' : provider);
      const page = await context.newPage();
      await page.goto(posting.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const frame = await formFrame(page, posting);
      await frame.waitForSelector(posting.ready, { timeout: 60_000 });
      await countSubmits(frame);
      const startUrl = frame.url();

      const panel = await extension.openSidePanel(page);
      await expect(panel.getByTestId('posting')).toBeVisible({ timeout: 30_000 });
      const postingTitle = await panel.getByTestId('posting-title').textContent();
      const postingLine = await panel.getByTestId('posting').locator('p').first().textContent();
      await panel.getByRole('button', { name: 'Fill', exact: true }).click();
      await expect(panel.getByTestId('fill-done')).toBeVisible({ timeout: 360_000 });
      // Let the last write settle before reading the form back.
      await page.waitForTimeout(1500);

      // LIVE_POLISH=1: on a form with an AI-use policy, write your own draft for the first
      // required question and have the Provider polish it (one more call). Nothing is accepted.
      if (process.env['LIVE_POLISH'] === '1') {
        // Pin the card by its field: once it's polishing it's no longer "yourDraft".
        const fieldId = await panel
          .locator('[data-testid="field"]:has([data-testid="draft-card"][data-status="yourDraft"])')
          .first()
          .getAttribute('data-field-id')
          .catch(() => null);
        const card = panel.locator(
          `[data-testid="field"][data-field-id="${fieldId ?? ''}"] [data-testid="draft-card"]`,
        );
        if (fieldId !== null && (await card.count()) > 0) {
          await card.getByTestId('draft-text').fill(POLISH_INPUT);
          await card.getByRole('button', { name: 'Polish' }).click();
          await expect(card).toHaveAttribute('data-status', /ready|failed/, { timeout: 180_000 });
        }
      }

      const { fields, debug } = await fieldReports(panel, frame);
      const notices = await panel
        .locator('[data-testid="provider-unavailable"], [data-testid="panel-notice"]')
        .allTextContents();
      const spent = await calls();
      const shot = `${runDir()}/${posting.id}.${provider}`;
      await page.screenshot({ path: `${shot}.form.png`, fullPage: true });
      await panel.screenshot({ path: `${shot}.panel.png`, fullPage: true });
      const submitEvents = await submits(frame);
      const file = await writeRun(`${posting.id}.${provider}`, {
        posting: { ...posting, title: postingTitle, line: postingLine },
        provider,
        calls: spent,
        tally: tally(fields),
        notices,
        network,
        submitEvents,
        urlBefore: startUrl,
        urlAfter: frame.url(),
        fields,
        debug,
      });
      test.info().annotations.push({ type: 'run', description: file });

      // Nothing was submitted, and nothing left the page.
      expect(submitEvents).toBe(0);
      expect(frame.url()).toBe(startUrl);
      expect(network.aborted.filter((r) => r.url.includes('/submit') || r.url.includes('Submit'))).toEqual(
        [],
      );
      // Every field got an outcome.
      expect(fields.filter((f) => f.outcome === 'awaiting')).toEqual([]);
    });
  });
}
