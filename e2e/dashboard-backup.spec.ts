import { download, fileOf } from './dashboard';
import { expect, test } from './harness';

// Saved Answers, Resumes, and a full JSON backup restored over them, in real
// Chrome storage (Resume files are Blobs in IndexedDB).

const RESUME_TEXT = 'Sam Lee\nSoftware Engineer';

test('backs up everything, Resume files included, and restores it', async ({ extension }) => {
  const page = await extension.openDashboard('resumes');
  await page.getByTestId('resume-file').setInputFiles(fileOf('sam-lee.txt', RESUME_TEXT, 'text/plain'));
  await page.getByTestId('resume-label').fill('Backend');
  await page.getByRole('button', { name: 'Add Resume' }).click();
  await expect(page.getByTestId('resume-Backend')).toContainText('Default');

  // A Saved Answer with an answer for one company.
  await page.getByRole('link', { name: 'Saved Answers' }).click();
  await page.getByRole('button', { name: 'Add a Saved Answer' }).click();
  const editor = page.getByTestId('saved-answer-editor');
  await editor.getByTestId('field-question').fill('Why do you want to work here?');
  await editor.getByTestId('field-answer').fill('I like the problems you solve.');
  await editor.getByRole('button', { name: 'Add an answer for a company' }).click();
  await editor.getByTestId('field-employerOverrides.0.employer').fill('Acme');
  await editor.getByTestId('field-employerOverrides.0.answer').fill('Acme builds what I use daily.');
  await editor.getByRole('button', { name: 'Save' }).click();
  const saved = page.getByTestId('saved-answer');
  await expect(saved).toContainText('Why do you want to work here?');
  await expect(saved).toContainText('acme');

  // The same question again, worded differently, is refused: matching ignores case and punctuation.
  await page.getByRole('button', { name: 'Add a Saved Answer' }).click();
  await editor.getByTestId('field-question').fill('why do you want to work here');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.getByTestId('error-question')).toHaveText(
    'You already have a Saved Answer for this question',
  );
  await editor.getByRole('button', { name: 'Cancel' }).click();

  // Back up.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Export everything' }).click();
  const backup = await download(page, page.getByTestId('backup-download'));
  expect(backup.name).toMatch(/^employ-me-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const parsed = JSON.parse(backup.text) as { resumes: { dataBase64: string }[] };
  expect(Buffer.from(parsed.resumes[0]?.dataBase64 ?? '', 'base64').toString()).toBe(RESUME_TEXT);

  // Lose things.
  await page.getByRole('link', { name: 'Saved Answers' }).click();
  await saved.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(saved).toHaveCount(0);
  await page.getByRole('link', { name: 'Resumes' }).click();
  await page.getByTestId('resume-Backend').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Resume' }).click();
  await expect(page.getByTestId('resume-Backend')).toHaveCount(0);

  // Restore: it asks first, saying what the backup holds.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByTestId('backup-file').setInputFiles(fileOf(backup.name, backup.text, 'application/json'));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('0 Applications, 1 Saved Answer and 1 Resume');
  await dialog.getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByTestId('toasts')).toContainText('Backup restored');

  await page.getByRole('link', { name: 'Saved Answers' }).click();
  await expect(saved).toContainText('Acme builds what I use daily.');
  await page.getByRole('link', { name: 'Resumes' }).click();
  const restored = await download(
    page,
    page.getByTestId('resume-Backend').getByRole('link', { name: 'Download' }),
  );
  expect(restored).toEqual({ name: 'sam-lee.txt', text: RESUME_TEXT });

  // A file that isn't a backup changes nothing.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page
    .getByTestId('backup-file')
    .setInputFiles(fileOf('notes.json', '{"hello":"world"}', 'application/json'));
  await expect(page.getByTestId('backup-settings').getByTestId('error-notice')).toContainText(
    'isn’t an employ-me backup',
  );
  expect(extension.errors).toEqual([]);
});
