import type { Page } from '@playwright/test';
import { greenhousePosting, sendToBackground } from './dashboard';
import { expect, test } from './harness';

// The Tracker (design.md "Tracking"). No helper is involved.

interface ByHand {
  readonly company: string;
  readonly url: string;
  readonly title?: string;
  readonly status?: string;
  readonly notes?: string;
}

async function addByHand(page: Page, application: ByHand) {
  await page.locator('header.page-header').getByRole('button', { name: 'Add Application' }).click();
  const form = page.getByTestId('add-application');
  await form.getByTestId('field-company').fill(application.company);
  await form.getByTestId('field-url').fill(application.url);
  if (application.title !== undefined) await form.getByTestId('field-title').fill(application.title);
  if (application.status !== undefined)
    await form.getByTestId('field-status').selectOption(application.status);
  if (application.notes !== undefined) await form.getByTestId('field-notes').fill(application.notes);
  await form.getByRole('button', { name: 'Add Application' }).click();
  await expect(form).toHaveCount(0);
}

const SNAPSHOT = {
  capturedAt: '2026-10-27T12:00:00Z',
  // Greenhouse's API sends the description as escaped HTML.
  postingDescription:
    '&lt;p&gt;Build &lt;b&gt;things&lt;/b&gt;.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;TypeScript&lt;/li&gt;&lt;li&gt;Postgres&lt;/li&gt;&lt;/ul&gt;',
  answers: [
    { label: 'First name', fieldType: 'name.first', value: 'Sam' },
    { label: 'Willing to relocate?', fieldType: 'pref.relocation', value: true },
  ],
  resume: { id: 'r1', label: 'Main', fileName: 'sam-lee.pdf' },
};

test('adds Applications by hand, then searches, filters, and changes Status and notes', async ({
  extension,
}) => {
  const page = await extension.openDashboard('tracker');
  await expect(page.getByTestId('tracker-empty')).toBeVisible();

  await addByHand(page, {
    company: 'Acme',
    url: 'https://job-boards.greenhouse.io/acme/jobs/111',
    title: 'Backend Engineer',
  });
  // A new Application opens on its own, with no Snapshot: you added it by hand.
  await expect(page.getByTestId('detail-title')).toHaveText('Backend Engineer');
  await expect(page.getByTestId('no-snapshot')).toBeVisible();

  await addByHand(page, {
    company: 'Initech',
    url: 'https://careers.initech.example/jobs/42',
    title: 'Platform Engineer',
    status: 'interviewing',
    notes: 'Recruiter: Pat',
  });
  await addByHand(page, {
    company: 'Acme',
    url: 'https://job-boards.greenhouse.io/acme/jobs/222',
    title: 'Designer',
    status: 'rejected',
  });

  // The same Posting again: the already-applied warning.
  await page.locator('header.page-header').getByRole('button', { name: 'Add Application' }).click();
  const form = page.getByTestId('add-application');
  await form.getByTestId('field-company').fill('Acme');
  await form
    .getByTestId('field-url')
    .fill('https://job-boards.greenhouse.io/acme/jobs/111?gh_src=newsletter');
  await form.getByRole('button', { name: 'Add Application' }).click();
  await expect(form.getByTestId('already-applied')).toBeVisible();
  await form.getByRole('button', { name: 'Cancel' }).click();

  const rows = page.getByTestId('application-row');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('header.page-header')).toContainText('3 Applications: 1 interviewing, 0 offers.');

  // Search, and filter by Status and company.
  const search = page.getByRole('searchbox', { name: 'Search Applications' });
  await search.fill('platform');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Initech');
  await search.fill('pat');
  await expect(rows).toContainText('Initech');
  await search.fill('');
  await page.getByTestId('status-filter-interviewing').click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'All 3' }).click();
  await page.getByTestId('company-filter').selectOption('Acme');
  await expect(rows).toHaveCount(2);
  await page.getByTestId('status-filter-rejected').click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Designer');
  await page.getByTestId('status-filter-offer').click();
  await expect(page.getByTestId('tracker-no-match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows).toHaveCount(3);

  // Status and notes are yours to change.
  await rows.filter({ hasText: 'Backend Engineer' }).click();
  const detail = page.getByTestId('application-detail');
  await detail
    .getByRole('group', { name: 'Change Status' })
    .getByRole('button', { name: 'Interviewing' })
    .click();
  await expect(rows.filter({ hasText: 'Backend Engineer' }).getByTestId('status-badge')).toHaveText(
    'Interviewing',
  );
  await detail.getByTestId('application-notes').fill('Phone screen Tuesday, 10am');
  await detail.getByRole('button', { name: 'Save notes' }).click();
  await expect(detail.getByRole('button', { name: 'Save notes' })).toHaveCount(0);

  await page.reload();
  await rows.filter({ hasText: 'Backend Engineer' }).click();
  await expect(detail.getByTestId('application-notes')).toHaveValue('Phone screen Tuesday, 10am');
  await expect(
    detail.getByRole('group', { name: 'Change Status' }).getByRole('button', { name: 'Interviewing' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('header.page-header')).toContainText('2 interviewing');

  expect(extension.errors).toEqual([]);
});

test('shows the Snapshot of a submission the side panel records, as it happens', async ({ extension }) => {
  const tracker = await extension.openDashboard('tracker');
  await expect(tracker.getByTestId('tracker-empty')).toBeVisible();

  // What the Fill flow will send when the ATS confirms a submission.
  const panel = await extension.openSidePanel();
  const posting = greenhousePosting('555', 'Acme', 'Staff Engineer');
  const recorded = await sendToBackground(panel, 'applications.recordSubmission', {
    source: 'confirmation',
    posting,
    snapshot: SNAPSHOT,
  });
  expect(recorded).toMatchObject({ ok: true, value: { status: 'applied', snapshot: SNAPSHOT } });

  // The open Tracker updates without a reload.
  const row = tracker.getByTestId('application-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Snapshot');
  await row.click();
  const detail = tracker.getByTestId('application-detail');
  await expect(detail).toContainText('Recorded when the job site confirmed your submission');
  await expect(detail.getByTestId('snapshot-resume')).toHaveText('Main · sam-lee.pdf');
  await expect(detail.getByTestId('snapshot-answers')).toContainText('First name');
  await expect(detail.getByTestId('snapshot-answers')).toContainText('Yes');
  const description = detail.getByTestId('snapshot-description');
  await expect(description).toContainText('Build things.');
  await expect(description).toContainText('• TypeScript');
  await expect(description).not.toContainText('<p>');

  // The already-applied warning can find it by Posting.
  expect(await sendToBackground(panel, 'applications.findByPosting', { key: posting.key })).toMatchObject({
    ok: true,
    value: [{ hasSnapshot: true, posting: { title: 'Staff Engineer' } }],
  });

  // Deleting asks first.
  await detail.getByRole('button', { name: 'Delete Application' }).click();
  await tracker.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(tracker.getByTestId('tracker-empty')).toBeVisible();
  expect(extension.errors).toEqual([]);
});
