import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, FIXTURES_DIR, test } from './harness';
import { formFixture } from './forms';
import { clickFill, fieldRow, servePublicApi } from './panel';
import { seedTestProfile } from './seed';
import { isSubmission, stubSideRequests } from './side-requests';

// Open application form (design.md "Starting a Fill"): on a Posting's
// description page whose Application Form is at another address, the side
// panel points the tab there with tabs.update. It never clicks the page's
// Apply button, or anything else on the page. Once the form loads, the panel
// finds it and Fill is ready. Where the form is on the description page
// (Greenhouse), there is no button.

test.use({ helper: 'fake' });

const ANTHROPIC_API =
  'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5456619008?questions=true&pay_transparency=true';

/** Counts clicks and submits on the job site from now on, in sessionStorage: it outlives the navigation. */
async function countPageClicks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bump = () => {
      sessionStorage.setItem('employMeClicks', String(Number(sessionStorage.getItem('employMeClicks')) + 1));
    };
    document.addEventListener('click', bump, true);
    document.addEventListener('submit', bump, true);
  });
}

const pageClicks = (page: Page) => page.evaluate(() => Number(sessionStorage.getItem('employMeClicks')));

/**
 * The panel offers Open application form on the description page; clicking it
 * loads `formUrl` without a click on the page, and the panel finds the form.
 */
async function openForm(page: Page, panel: Page, formUrl: string): Promise<void> {
  await expect(panel.getByTestId('no-form')).toBeVisible({ timeout: 15_000 });
  await countPageClicks(page);
  await panel.getByRole('button', { name: 'Open application form' }).click();
  await page.waitForURL(formUrl);
  await expect(panel.getByRole('button', { name: 'Fill', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByTestId('open-form')).toHaveCount(0);
  expect(await pageClicks(page)).toBe(0);
}

test('Lever: from the Posting to its /apply form, then Fill', async ({ page, sites, extension }) => {
  test.setTimeout(120_000);
  await seedTestProfile(extension);
  const form = formFixture('lever/eqbank-2026-10-28');
  const jobId = 'a20b80c5-53c4-4c34-b8de-c6d9208994a6';
  const posting = `https://jobs.lever.co/eqbank/${jobId}`;
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await sites.serve(new RegExp(`^${posting}\\?`), 'lever/eqbank-description.html');
  await servePublicApi(page.context(), `https://api.lever.co/v0/postings/eqbank/${jobId}?mode=json`, {
    text: 'Software Engineer',
    categories: { location: 'Toronto, Ontario' },
  });
  // Tracking parameters don't follow you to the form.
  await page.goto(`${posting}?lever-source=example`, { waitUntil: 'load' });
  const panel = await extension.openSidePanel({ forPage: page });
  await expect(panel.getByTestId('no-form')).toContainText('Its Application Form is on another page.');

  await openForm(page, panel, form.url);
  expect(page.url()).toBe(form.url);
  await expect(panel.getByTestId('posting-title')).not.toHaveText('');

  await clickFill(panel);
  await expect(fieldRow(panel, 'email')).toHaveAttribute('data-outcome', 'filled');
  await expect(page.locator('input[name="email"]')).toHaveValue('sam.lee@example.com');
  await expect(panel.getByTestId('fill-progress-text')).toHaveText(/^Filled \d+ of \d+ \(\d+%\)$/);
  expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);
  expect(extension.errors).toEqual([]);
});

test('Ashby: from the Overview to its /application form', async ({ page, sites, extension }) => {
  test.setTimeout(90_000);
  const form = formFixture('ashby/wealthsimple-2026-10-28');
  const posting = 'https://jobs.ashbyhq.com/wealthsimple/eeb6b49e-cd1a-4ac0-ab93-67dbc631758d';
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await sites.serve(posting, 'ashby/wealthsimple-description.html');
  await servePublicApi(
    page.context(),
    'https://api.ashbyhq.com/posting-api/job-board/wealthsimple?includeCompensation=true',
    { jobs: [] },
  );
  await page.goto(posting, { waitUntil: 'load' });
  const panel = await extension.openSidePanel({ forPage: page });

  await openForm(page, panel, form.url);
  expect(extension.errors).toEqual([]);
});

test('Workday: from the Posting to its apply flow', async ({ page, sites, extension }) => {
  test.setTimeout(90_000);
  const posting =
    'https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1';
  const formUrl = `${posting}/apply/applyManually`;
  await sites.serve(posting, 'workday/rbc-2026-10-28.posting.html');
  await sites.serve(formUrl, 'workday/synthetic-ca-apply.html');
  await sites.serve(
    'https://rbc.wd3.myworkdayjobs.com/employ-me-synthetic/synthetic-workday.js',
    'workday/synthetic-workday.js',
  );
  await servePublicApi(
    page.context(),
    'https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1',
    JSON.parse(await readFile(path.join(FIXTURES_DIR, 'workday/rbc-2026-10-28.cxs.json'), 'utf8')),
  );
  await page.goto(posting, { waitUntil: 'load' });
  const panel = await extension.openSidePanel({ forPage: page });

  await openForm(page, panel, formUrl);
  expect(extension.errors).toEqual([]);
});

test('Greenhouse: the form is on the Posting’s page, so there is no button', async ({
  page,
  sites,
  extension,
}) => {
  const form = formFixture('greenhouse/anthropic-2026-10-28');
  await sites.replay(`${form.name}.har`);
  await servePublicApi(page.context(), ANTHROPIC_API, { title: '3P Revenue Accounting & Reporting' });
  await page.goto(form.url, { waitUntil: 'load' });
  const panel = await extension.openSidePanel({ forPage: page });
  await expect(panel.getByRole('button', { name: 'Fill', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByTestId('open-form')).toHaveCount(0);
  await expect(panel.getByTestId('no-form')).toHaveCount(0);
});
