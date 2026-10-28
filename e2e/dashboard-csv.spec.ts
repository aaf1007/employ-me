import type { Page } from '@playwright/test';
import { parseCsv } from '../packages/extension/src/tracker/csv';
import { download, fileOf, greenhousePosting, sendToBackground } from './dashboard';
import { expect, test } from './harness';

// The Tracker as CSV (design.md "Tracker features"): export, and import with
// the columns you map. Imported Applications have no Snapshot.

function rowsOf(csv: string): string[][] {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

async function importCsv(page: Page, name: string, text: string) {
  await page.locator('header.page-header').getByRole('button', { name: 'Import CSV' }).click();
  await page.getByTestId('csv-file').setInputFiles(fileOf(name, text, 'text/csv'));
}

async function deleteEveryApplication(page: Page) {
  const rows = page.getByTestId('application-row');
  // The list reloads just after each delete: wait for it, or the next click races it.
  for (let left = await rows.count(); left > 1; left--) {
    await rows.first().click();
    await page.getByRole('button', { name: 'Delete Application' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(rows).toHaveCount(left - 1);
  }
  await rows.first().click();
  await page.getByRole('button', { name: 'Delete Application' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('tracker-empty')).toBeVisible();
}

test('exports the Tracker as CSV and imports it back the same, without Snapshots', async ({ extension }) => {
  const page = await extension.openDashboard('tracker');
  // A title that is a spreadsheet formula, with quotes and a comma: it comes from the job site.
  await sendToBackground(page, 'applications.recordSubmission', {
    source: 'confirmation',
    posting: greenhousePosting('7', 'Acme', '=Senior, "Platform" Engineer'),
    snapshot: { capturedAt: '2026-10-27T12:00:00Z', postingDescription: 'JD', answers: [], resume: null },
  });
  await page.locator('header.page-header').getByRole('button', { name: 'Add Application' }).click();
  const form = page.getByTestId('add-application');
  await form.getByTestId('field-company').fill('Initech');
  await form.getByTestId('field-url').fill('https://careers.initech.example/jobs/42');
  await form.getByTestId('field-title').fill('Platform Engineer');
  await form.getByTestId('field-appliedAt').fill('2026-10-01');
  await form.getByTestId('field-status').selectOption('interviewing');
  await form.getByTestId('field-notes').fill('Phone screen, then onsite\nwith Pat');
  await form.getByRole('button', { name: 'Add Application' }).click();
  await expect(page.getByTestId('application-row')).toHaveCount(2);

  const exported = await download(page, page.getByTestId('csv-export'));
  expect(exported.name).toBe('employ-me-applications.csv');
  const rows = rowsOf(exported.text);
  expect(rows[0]).toEqual([
    'Company',
    'Title',
    'Location',
    'Country',
    'Status',
    'Applied',
    'Notes',
    'URL',
    'ATS',
    'Employer key',
    'Job ID',
    'Source',
    'Snapshot',
  ]);
  expect(rows.map((row) => row[1])).toContain('=Senior, "Platform" Engineer');
  // Guarded so a spreadsheet shows it as text.
  expect(exported.text).toContain(`"'=Senior, ""Platform"" Engineer"`);

  // Importing it into the same Tracker skips what's already there.
  await importCsv(page, exported.name, exported.text);
  await expect(page.getByTestId('csv-ready')).toHaveText('2 Applications ready to import');
  await page.getByRole('button', { name: 'Import 2 Applications' }).click();
  await expect(page.getByTestId('toasts')).toContainText(
    'Imported 0 Applications. 2 were already in your Tracker.',
  );

  // Into an empty Tracker, it comes back the same, minus the Snapshot.
  await deleteEveryApplication(page);
  await importCsv(page, exported.name, exported.text);
  await page.getByRole('button', { name: 'Import 2 Applications' }).click();
  await expect(page.getByTestId('toasts')).toContainText('Imported 2 Applications.');
  await expect(page.getByTestId('application-row')).toHaveCount(2);
  await page.getByTestId('application-row').filter({ hasText: 'Acme' }).click();
  await expect(page.getByTestId('detail-title')).toHaveText('=Senior, "Platform" Engineer');
  await expect(page.getByTestId('no-snapshot')).toBeVisible();
  await expect(page.getByTestId('application-detail')).toContainText('Imported from CSV');

  const again = rowsOf((await download(page, page.getByTestId('csv-export'))).text);
  const withoutSourceAndSnapshot = (table: string[][]) => table.map((row) => row.slice(0, -2));
  expect(withoutSourceAndSnapshot(again)).toEqual(withoutSourceAndSnapshot(rows));
  expect(again.slice(1).map((row) => row.slice(-2))).toEqual([
    ['import', 'no'],
    ['import', 'no'],
  ]);
  expect(extension.errors).toEqual([]);
});

test('imports a spreadsheet from elsewhere with the columns you map', async ({ extension }) => {
  const page = await extension.openDashboard('tracker');
  const csv = [
    'Employer,Role,Link,When,Stage,Comments',
    'Acme,Engineer,https://job-boards.greenhouse.io/acme/jobs/123,2026-10-20,Interviewing,Nice team',
    'Globex,Designer,https://careers.globex.example/jobs/9,Oct 3 2026,,',
    ',Nobody,https://example.com/jobs/1,2026-10-01,,',
    'Hooli,SRE,not a link,2026-10-01,,',
  ].join('\r\n');
  await importCsv(page, 'my-search.csv', csv);

  // Columns whose header reads like a field are mapped for you; you map the rest.
  await expect(page.getByTestId('map-company')).toHaveValue('0');
  await expect(page.getByTestId('map-title')).toHaveValue('1');
  await expect(page.getByTestId('map-url')).toHaveValue('2');
  await expect(page.getByTestId('map-status')).toHaveValue('4');
  await expect(page.getByTestId('map-appliedAt')).toHaveValue('');
  await page.getByTestId('map-appliedAt').selectOption('3');
  await page.getByTestId('map-notes').selectOption('5');

  await expect(page.getByTestId('csv-ready')).toHaveText('2 Applications ready to import');
  const problems = page.getByTestId('csv-problems');
  await expect(problems).toContainText('Row 4: No company.');
  await expect(problems).toContainText('Row 5: No posting URL');
  await page.getByRole('button', { name: 'Import 2 Applications' }).click();

  const rows = page.getByTestId('application-row');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'Acme' }).click();
  const detail = page.getByTestId('application-detail');
  await expect(rows.filter({ hasText: 'Acme' }).getByTestId('status-badge')).toHaveText('Interviewing');
  await expect(detail.getByTestId('application-notes')).toHaveValue('Nice team');
  await expect(detail).toContainText('Oct 20, 2026');
  await expect(detail.getByTestId('no-snapshot')).toBeVisible();
  expect(extension.errors).toEqual([]);
});
