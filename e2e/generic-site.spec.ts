import type { Page } from '@playwright/test';
import { expect, test, type Extension } from './harness';
import { formFixture } from './forms';
import { countSubmits, fieldRow, outlineOf, submits } from './panel';
import { seedTestProfile } from './seed';
import { isSubmission, stubSideRequests } from './side-requests';

// The generic fallback (design.md "Job sites"): on a company's own site the
// content script runs only when you click Fill in the side panel, then the
// Fill lists what it couldn't fill, records the Application on "Did you
// apply?", and warns when you come back.
//
// Test-only path: Playwright can't click Chrome's toolbar icon, which is
// what grants activeTab for the page, nor answer Chrome's permission prompt
// for a frame from another site. The test build's manifest holds these test
// sites as host permissions instead (packages/extension/wxt.config.ts,
// E2E_COMPANY_SITES); everything after that grant is the real code path:
// scripting.executeScript into each frame, then the same Fill as on any job site.

test.use({ helper: 'inMemory' });

async function openUnknownSite(page: Page, extension: Extension) {
  const panel = await extension.openSidePanel({ forPage: page });
  await expect(panel.getByTestId('unknown-site')).toBeVisible({ timeout: 15_000 });
  // Opening the panel ran nothing in the page.
  expect(await extension.pingContentScripts()).toEqual([]);
  return panel;
}

async function clickFill(panel: Page) {
  await panel.getByTestId('unknown-site').getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(panel.getByTestId('fill-done')).toBeVisible({ timeout: 60_000 });
}

test('a company’s own form: Fill reads it only on your click, lists what it couldn’t fill, and tracks it', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(120_000);
  await seedTestProfile(extension);
  const form = formFixture('generic/helsing-2026-10-28');
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await page.goto(form.url, { waitUntil: 'load' });
  await page.waitForSelector('input[name="first_name"]', { timeout: 20_000 });
  await countSubmits(page.mainFrame());
  const startUrl = page.url();

  const panel = await openUnknownSite(page, extension);
  await expect(panel.getByTestId('unknown-site-host')).toHaveText('helsing.ai');
  await expect(panel.getByTestId('already-applied')).toHaveCount(0);

  await clickFill(panel);
  await expect(panel.getByTestId('posting-title')).toHaveText('Accountant');
  await expect(fieldRow(panel, 'first_name')).toHaveAttribute('data-outcome', 'filled');
  await expect(page.locator('input[name="first_name"]')).toHaveValue('Sam');
  expect(await outlineOf(page.mainFrame(), 'input[name="first_name"]')).toBe('solid');
  // What it couldn't fill says why and what to do; the Attestation is left for you.
  const clearance = fieldRow(panel, 'question_9310680101');
  await expect(clearance).toHaveAttribute('data-outcome', 'couldNotFill');
  await expect(clearance.getByTestId('field-fix')).not.toBeEmpty();
  await expect(fieldRow(panel, 'question_9310679101')).toHaveAttribute('data-outcome', 'couldNotFill');
  await expect(page.locator('input[name="question_9310679101"]').first()).not.toBeChecked();
  await expect(panel.getByTestId('outcome-awaiting')).toHaveCount(0);

  // The content script runs in the page now, and nothing was submitted.
  await expect
    .poll(() => extension.pingContentScripts())
    .toEqual([{ type: 'pong', ats: 'generic', url: startUrl, topFrame: true }]);
  expect(await submits(page.mainFrame())).toBe(0);
  expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);
  expect(page.url()).toBe(startUrl);

  // You submit and the site shows its own thank-you page: no confirmation employ-me knows, so it asks.
  await page.context().route('https://helsing.ai/thanks', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Helsing</title><p>Thank you!</p>',
    }),
  );
  await page.goto('https://helsing.ai/thanks', { waitUntil: 'load' });
  const ask = panel.getByTestId('did-you-apply');
  await expect(ask).toBeVisible({ timeout: 20_000 });
  await ask.getByRole('button', { name: 'Yes, I applied' }).click();
  await expect(panel.getByTestId('application-recorded')).toBeVisible();

  const tracker = await extension.openDashboard('tracker');
  await tracker.getByTestId('application-row').click();
  const detail = tracker.getByTestId('application-detail');
  await expect(detail).toContainText('Recorded when you said you applied');
  // No public API: the Snapshot keeps the page's own description (its JSON-LD).
  await expect(detail.getByTestId('snapshot-description')).toContainText('Helsing is a defence AI company');
  await expect(detail.getByTestId('snapshot-answers')).toContainText('sam.lee@example.com');

  // Back on the Posting, the warning shows before anything reads the page.
  await page.goto(form.url, { waitUntil: 'load' });
  await expect(panel.getByTestId('unknown-site')).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByTestId('already-applied')).toBeVisible();
  expect(extension.errors).toEqual([]);
});

test('a form in an iframe from another unknown site is filled inside its frame', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(90_000);
  await seedTestProfile(extension);
  await sites.serve('https://careers.example.org/jobs/42', 'generic/synthetic-company-page.html');
  await sites.serve('https://forms.example.net/apply/42', 'generic/synthetic-hosted-form.html');
  await page.goto('https://careers.example.org/jobs/42', { waitUntil: 'load' });
  const frame = page.frameLocator('#application');
  await expect(frame.locator('#first_name')).toBeVisible();
  const formFrame = page.frames().find((f) => f.url().startsWith('https://forms.example.net/'));
  if (formFrame === undefined) throw new Error('the form frame did not load');
  await countSubmits(formFrame);

  const panel = await openUnknownSite(page, extension);
  await expect(panel.getByTestId('unknown-site-host')).toHaveText('careers.example.org');
  await clickFill(panel);

  await expect(fieldRow(panel, 'first_name')).toHaveAttribute('data-outcome', 'filled');
  await expect(frame.locator('#first_name')).toHaveValue('Sam');
  await expect(frame.locator('#email')).toHaveValue('sam.lee@example.com');
  expect(await outlineOf(formFrame, '#email')).toBe('solid');
  // An option the AI couldn't match, and the Attestation, are listed with a fix and left alone.
  await expect(fieldRow(panel, 'shirt')).toHaveAttribute('data-outcome', 'couldNotFill');
  await expect(fieldRow(panel, 'consent')).toHaveAttribute('data-outcome', 'couldNotFill');
  await expect(frame.locator('#consent')).not.toBeChecked();
  // The required question is drafted, and waits for you.
  await expect(fieldRow(panel, 'why').getByTestId('draft-card')).toHaveAttribute('data-status', 'ready');
  await expect(frame.locator('#why')).toHaveValue('');
  // The company page's own search box was left alone.
  await expect(page.getByRole('searchbox', { name: 'Search jobs' })).toHaveValue('');
  expect(await submits(formFrame)).toBe(0);
  expect(sites.blocked).toEqual([]);
  expect(extension.errors).toEqual([]);
});
