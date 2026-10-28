import type { Page } from '@playwright/test';
import { expect, test } from './harness';
import { formFixture } from './forms';
import { acceptDraft, clickFill, draftReady, fieldRow, nextStep, servePublicApi } from './panel';
import { seedTestProfile } from './seed';
import { stubSideRequests } from './side-requests';

// The Fill's progress bar (design.md "What you see"): "Filled 18 of 22
// (82%)" over every field the Fill lists, counting only filled ones, and
// "Required: 9 of 10". It follows each outcome as it arrives: the rules, the
// AI round, an accepted Draft's re-plan, and each later step of the form.

test.use({ helper: 'fake' });

interface Seen {
  readonly now: string | null;
  readonly max: string | null;
  readonly filled: number;
  readonly total: number;
  readonly awaiting: number;
}

/** Records the bar and the field rows after every change the panel renders, from now on. */
async function watchProgress(panel: Page): Promise<() => Promise<Seen[]>> {
  await panel.evaluate(() => {
    const seen: Seen[] = [];
    Object.assign(globalThis, { employMeProgress: seen });
    const look = () => {
      const bar = document.querySelector('[role="progressbar"]');
      if (bar === null) return;
      const outcomes = [...document.querySelectorAll('[data-testid="field"]')].map((row) =>
        row.getAttribute('data-outcome'),
      );
      seen.push({
        now: bar.getAttribute('aria-valuenow'),
        max: bar.getAttribute('aria-valuemax'),
        filled: outcomes.filter((o) => o === 'filled').length,
        total: outcomes.length,
        awaiting: outcomes.filter((o) => o === 'awaiting').length,
      });
    };
    new MutationObserver(look).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  return () => panel.evaluate(() => (globalThis as unknown as { employMeProgress: Seen[] }).employMeProgress);
}

async function expectProgress(
  panel: Page,
  filled: number,
  total: number,
  required: readonly [number, number] | null,
): Promise<void> {
  const percent = filled === total ? 100 : Math.min(99, Math.max(1, Math.round((filled / total) * 100)));
  const text = `Filled ${filled} of ${total} (${percent}%)`;
  const bar = panel.getByRole('progressbar', { name: text });
  await expect(bar).toHaveAttribute('aria-valuenow', String(filled));
  await expect(bar).toHaveAttribute('aria-valuemax', String(total));
  await expect(bar).toHaveAttribute('aria-valuemin', '0');
  await expect(bar).toHaveAttribute('aria-valuetext', text);
  const line = panel.getByTestId('fill-progress-required');
  if (required === null) await expect(line).toHaveCount(0);
  else await expect(line).toHaveText(`Required: ${required[0]} of ${required[1]}`);
}

/** What the rows say right now, so a recorded form's numbers come from the panel's own groups. */
async function rowCounts(panel: Page) {
  const rows = (attributes: string) => panel.locator(`[data-testid="field"]${attributes}`).count();
  return {
    filled: await rows('[data-outcome="filled"]'),
    total: await rows(''),
    requiredFilled: await rows('[data-outcome="filled"][data-required="true"]'),
    required: await rows('[data-required="true"]'),
  };
}

test('follows the Fill through the AI round, a Draft you accept and the next step', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(90_000);
  await seedTestProfile(extension);
  const formUrl = 'https://job-boards.greenhouse.io/acme/jobs/7654321';
  await sites.serve(formUrl, 'greenhouse/multi-step.html');
  await servePublicApi(
    page.context(),
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/7654321?questions=true&pay_transparency=true',
    { title: 'Platform Engineer', company_name: 'Acme' },
  );
  await page.goto(formUrl);
  const panel = await extension.openSidePanel({ forPage: page });
  await expect(panel.getByRole('button', { name: 'Fill', exact: true })).toBeVisible();
  await expect(panel.getByTestId('fill-progress')).toHaveCount(0);
  const seen = await watchProgress(panel);

  // Step 1: both names, both required.
  await clickFill(panel);
  await expectProgress(panel, 2, 2, [2, 2]);

  // You click Next. Step 2 adds email, phone and a required question, which the AI drafts: it waits
  // for your review, so it isn't filled.
  await nextStep(panel, () => page.locator('#next').click(), 'email');
  await draftReady(panel, 'question_2002');
  await expectProgress(panel, 4, 5, [3, 4]);

  // Accepting the Draft writes it in through a re-plan: now every field is filled.
  await acceptDraft(panel, 'question_2002');
  await expectProgress(panel, 5, 5, [4, 4]);

  // At every moment the bar matched the rows the panel showed, including while the question was
  // still waiting for the AI.
  const history = await seen();
  for (const s of history) expect(s).toMatchObject({ now: String(s.filled), max: String(s.total) });
  expect(history.some((s) => s.awaiting > 0)).toBe(true);
  expect(new Set(history.map((s) => s.now))).toEqual(new Set(['2', '4', '5']));
  expect(extension.errors).toEqual([]);
});

test('a recorded form: Attestations and fields to review count as not filled', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(120_000);
  await seedTestProfile(extension);
  const form = formFixture('greenhouse/anthropic-2026-10-28');
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await servePublicApi(
    page.context(),
    'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5456619008?questions=true&pay_transparency=true',
    { title: '3P Revenue Accounting & Reporting', company_name: 'Anthropic' },
  );
  await page.goto(form.url, { waitUntil: 'load' });
  await page.waitForSelector('#first_name');
  const panel = await extension.openSidePanel({ forPage: page });
  await clickFill(panel);

  // Its Attestations (fixtures/greenhouse/anthropic-2026-10-28.expected.json) are left for you to tick.
  for (const id of ['question_19018742008', 'question_19018751008', 'question_19018752008']) {
    await expect(fieldRow(panel, id)).toHaveAttribute('data-outcome', 'couldNotFill');
  }
  const counts = await rowCounts(panel);
  expect(counts.filled).toBeLessThanOrEqual(counts.total - 3);
  expect(counts.required).toBeGreaterThan(0);
  await expectProgress(panel, counts.filled, counts.total, [counts.requiredFilled, counts.required]);
  expect(extension.errors).toEqual([]);
});
