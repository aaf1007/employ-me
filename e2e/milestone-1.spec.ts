import type { Page } from '@playwright/test';
import { expect, test, type Extension } from './harness';
import { formFrame } from './fill-page';
import { formFixture, type FormFixture } from './forms';
import { clickFill, countSubmits, fieldRow, outlineOf, servePublicApi, submits } from './panel';
import { seedTestProfile } from './seed';
import { isSubmission, stubSideRequests } from './side-requests';

// Milestone 1 (design.md), end to end in the real extension with the real
// helper and its fake Provider: open a Posting, Fill, review, accept a Draft,
// the job site confirms, the Application and its Snapshot are in the
// Tracker, and the already-applied warning shows when the Posting is opened
// again. Nothing is ever submitted: each confirmation is simulated the way
// that ATS shows it.

test.use({ helper: 'fake' });

const DESCRIPTION = 'Synthetic public API description for e2e: build useful tools.';

async function openPosting(page: Page, extension: Extension, form: FormFixture, ready: string) {
  await page.goto(form.url, { waitUntil: 'load' });
  const frame = await formFrame(page, form);
  await frame.waitForSelector(ready, { timeout: 20_000 });
  await countSubmits(frame);
  const panel = await extension.openSidePanel({ forPage: page });
  await expect(panel.getByTestId('posting-title')).not.toHaveText('');
  await expect(panel.getByTestId('resume-picker')).toHaveValue('r1');
  await expect(panel.getByTestId('already-applied')).toHaveCount(0);
  return { frame, panel };
}

/** The Tracker has the Application, its Snapshot and the accepted Draft; reopening warns. */
async function expectTracked(
  page: Page,
  panel: Page,
  extension: Extension,
  form: FormFixture,
  accepted: { readonly question: string; readonly answer: string },
) {
  await expect(panel.getByTestId('application-recorded')).toBeVisible({ timeout: 15_000 });

  const tracker = await extension.openDashboard('tracker');
  const row = tracker.getByTestId('application-row');
  await expect(row).toHaveCount(1);
  await row.click();
  const detail = tracker.getByTestId('application-detail');
  await expect(detail).toContainText('Recorded when the job site confirmed your submission');
  await expect(detail.getByTestId('snapshot-resume')).toHaveText('General · sam-lee-resume.pdf');
  await expect(detail.getByTestId('snapshot-answers')).toContainText(accepted.answer);
  await expect(detail.getByTestId('snapshot-answers')).toContainText('sam.lee@example.com');
  await expect(detail.getByTestId('snapshot-description')).toContainText(DESCRIPTION);

  await tracker.getByRole('link', { name: 'Saved Answers' }).click();
  await expect(tracker.getByTestId('saved-answer').filter({ hasText: accepted.question })).toContainText(
    accepted.answer,
  );

  await page.goto(form.url, { waitUntil: 'load' });
  await expect(panel.getByTestId('already-applied')).toBeVisible({ timeout: 15_000 });
  expect(extension.errors).toEqual([]);
}

test('Greenhouse: a required question is drafted during the Fill; its confirmation is recorded', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(150_000);
  await seedTestProfile(extension);
  const form = formFixture('greenhouse/geotab-2026-10-28');
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await servePublicApi(
    page.context(),
    'https://boards-api.greenhouse.io/v1/boards/geotab/jobs/5423014008?questions=true&pay_transparency=true',
    {
      title: 'Computer Vision Engineering',
      company_name: 'Geotab',
      content: `&lt;p&gt;${DESCRIPTION}&lt;/p&gt;`,
    },
  );
  const { frame, panel } = await openPosting(page, extension, form, '#first_name');
  const startUrl = frame.url();

  await clickFill(panel);

  // Every field in one group; Couldn't fill says why and what to do.
  await expect(fieldRow(panel, 'first_name')).toHaveAttribute('data-outcome', 'filled');
  await expect(fieldRow(panel, 'cover_letter')).toHaveAttribute('data-outcome', 'couldNotFill');
  await expect(fieldRow(panel, 'cover_letter').getByTestId('field-fix')).not.toBeEmpty();
  await expect(panel.getByTestId('outcome-awaiting')).toHaveCount(0);
  // The same fields get matching outlines on the page.
  expect(await outlineOf(frame, '#first_name')).toBe('solid');
  expect(await outlineOf(frame, '#cover_letter')).toBe('solid');

  // A required free-text question was drafted during the Fill; its made-up claim is flagged.
  const question = 'question_18658592008';
  const card = fieldRow(panel, question).getByTestId('draft-card');
  await expect(card).toHaveAttribute('data-status', 'ready');
  await expect(card.getByTestId('draft-flagged')).toContainText('I once led a team of fifty.');
  await expect(frame.locator(`#${question}`)).toHaveValue('');
  const answer = 'Yes: three years of GCP at Northwind.';
  await card.getByTestId('draft-text').fill(answer);
  await card.getByRole('button', { name: 'Accept Draft' }).click();
  await expect(fieldRow(panel, question)).toHaveAttribute('data-outcome', 'filled');
  await expect(frame.locator(`#${question}`)).toHaveValue(answer);

  // Nothing was submitted by the Fill.
  expect(await submits(frame)).toBe(0);
  expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);
  expect(frame.url()).toBe(startUrl);

  // You click Submit; Greenhouse's board moves to its confirmation without a page load (simulated).
  await frame.evaluate(() => {
    history.pushState({}, '', `${location.pathname}/confirmation`);
  });
  await expectTracked(page, panel, extension, form, { question: 'cloud computing', answer });
});

test('Lever: an AI-use policy switches Drafts to polish-my-draft; the /thanks page is recorded', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(150_000);
  await seedTestProfile(extension);
  const form = formFixture('lever/palantir-2026-10-28');
  const posting = 'https://jobs.lever.co/palantir/a5f93bb6-4f13-4451-80a4-f63090830269';
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await servePublicApi(
    page.context(),
    'https://api.lever.co/v0/postings/palantir/a5f93bb6-4f13-4451-80a4-f63090830269?mode=json',
    { text: 'Software Engineer', categories: { location: 'New York, NY' }, descriptionPlain: DESCRIPTION },
  );
  const { frame, panel } = await openPosting(page, extension, form, 'input[name="email"]');

  await clickFill(panel);
  await expect(fieldRow(panel, 'email')).toHaveAttribute('data-outcome', 'filled');
  // Lever's resume parser filled in someone else; the Fill wrote the Profile over it.
  await expect(frame.locator('input[name="email"]')).toHaveValue('sam.lee@example.com');
  expect(await outlineOf(frame, 'input[name="email"]')).toBe('solid');

  // An optional question: Couldn't fill, with a Draft button. Polish mode wants your text first.
  const question = 'cards[ce72d538-c9ad-41f3-8e9a-618d40c82e3a][field1]';
  const row = fieldRow(panel, question);
  await expect(row).toHaveAttribute('data-outcome', 'couldNotFill');
  await row.getByRole('button', { name: 'Draft' }).click();
  const card = row.getByTestId('draft-card');
  await expect(card).toHaveAttribute('data-status', 'yourDraft');
  await expect(card.getByTestId('polish-mode')).toBeVisible();
  await card.getByTestId('draft-text').fill('I want to build software that matters.');
  await card.getByRole('button', { name: 'Polish' }).click();
  await expect(card).toHaveAttribute('data-status', 'ready');
  await expect(card.getByTestId('draft-text')).toHaveValue(
    'I want to build software that matters. (polished)',
  );
  await expect(card.getByTestId('draft-flagged')).toHaveCount(0);
  await card.getByRole('button', { name: 'Accept Draft' }).click();
  await expect(row).toHaveAttribute('data-outcome', 'filled');
  const answer = 'I want to build software that matters. (polished)';
  await expect(frame.locator(`textarea[name="${question}"]`)).toHaveValue(answer);
  expect(await submits(frame)).toBe(0);
  expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);

  // You click Submit; Lever posts the form and loads its /thanks page (simulated).
  await page.context().route(`${posting}/thanks`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Palantir</title><h3>Application submitted!</h3>',
    }),
  );
  await page.goto(`${posting}/thanks`, { waitUntil: 'load' });
  await expectTracked(page, panel, extension, form, { question: 'work at Palantir', answer });
});

test('Ashby: the Draft button on an optional question; the success screen is recorded', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(150_000);
  await seedTestProfile(extension);
  const form = formFixture('ashby/wealthsimple-2026-10-28');
  const jobId = 'eeb6b49e-cd1a-4ac0-ab93-67dbc631758d';
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await servePublicApi(
    page.context(),
    'https://api.ashbyhq.com/posting-api/job-board/wealthsimple?includeCompensation=true',
    {
      jobs: [
        { id: jobId, title: 'Senior Software Engineer', location: 'Toronto', descriptionPlain: DESCRIPTION },
      ],
    },
  );
  const { frame, panel } = await openPosting(page, extension, form, '#_systemfield_email');

  await clickFill(panel);
  await expect(fieldRow(panel, '_systemfield_email')).toHaveAttribute('data-outcome', 'filled');
  expect(await outlineOf(frame, '#_systemfield_email')).toBe('solid');

  const question = '4739d095-04c7-4c2c-a5c0-ab305c2a71b9';
  const row = fieldRow(panel, question);
  await expect(row).toHaveAttribute('data-outcome', 'couldNotFill');
  await row.getByRole('button', { name: 'Draft' }).click();
  const card = row.getByTestId('draft-card');
  await expect(card).toHaveAttribute('data-status', 'ready');
  await expect(row).toHaveAttribute('data-outcome', 'needsReview');
  await expect(card.getByTestId('draft-flagged')).toContainText('I once led a team of fifty.');
  const answer = 'I use Wealthsimple every week.';
  await card.getByTestId('draft-text').fill(answer);
  await card.getByRole('button', { name: 'Accept Draft' }).click();
  await expect(row).toHaveAttribute('data-outcome', 'filled');
  await expect(frame.locator(`textarea[name="${question}"]`)).toHaveValue(answer);
  expect(await submits(frame)).toBe(0);
  expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);

  // You click Submit; Ashby swaps the form for its success screen (simulated).
  await frame.evaluate(() => {
    const done = document.createElement('div');
    done.className = 'ashby-application-form-success-container';
    done.textContent = 'Thank you for applying!';
    document.querySelector('.ashby-application-form-container')?.replaceWith(done);
  });
  await expectTracked(page, panel, extension, form, { question: 'Why Wealthsimple', answer });
});

test('Greenhouse embedded in a company site: the panel fills the form inside its frame', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(150_000);
  await seedTestProfile(extension);
  const form = formFixture('greenhouse/mongodb-2026-10-28');
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await servePublicApi(
    page.context(),
    'https://boards-api.greenhouse.io/v1/boards/mongodb/jobs/8258279?questions=true&pay_transparency=true',
    {
      title: 'Software Engineer Intern',
      company_name: 'MongoDB',
      content: `&lt;p&gt;${DESCRIPTION}&lt;/p&gt;`,
    },
  );
  const { frame, panel } = await openPosting(page, extension, form, '#first_name');

  await clickFill(panel);
  await expect(fieldRow(panel, 'first_name')).toHaveAttribute('data-outcome', 'filled');
  await expect(frame.locator('#first_name')).toHaveValue('Sam');
  expect(await outlineOf(frame, '#first_name')).toBe('solid');
  expect(await submits(frame)).toBe(0);
  expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);

  // The embedded board shows its confirmation inside the frame (simulated).
  await frame.evaluate(() => {
    history.pushState({}, '', `/embed/job_app/confirmation${location.search}`);
  });
  await expect(panel.getByTestId('application-recorded')).toBeVisible({ timeout: 15_000 });
  const tracker = await extension.openDashboard('tracker');
  await tracker.getByTestId('application-row').click();
  await expect(tracker.getByTestId('snapshot-description')).toContainText(DESCRIPTION);
  await expect(tracker.getByTestId('snapshot-answers')).toContainText('sam.lee@example.com');

  await page.goto(form.url, { waitUntil: 'load' });
  await expect(panel.getByTestId('already-applied')).toBeVisible({ timeout: 20_000 });
  expect(extension.errors).toEqual([]);
});
