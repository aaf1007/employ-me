import type { Page } from '@playwright/test';
import { download, fileOf, sendToBackground } from './dashboard';
import { expect, test } from './harness';
import { testBackup } from './seed';

// A Saved Answer stored before employ-me refused Self-ID, Attestation and
// never-stored questions (the guardrail hardening) is quarantined: it never
// reaches a Fill or the Provider, backups leave it out and say so, and the
// Saved Answers page shows it with a note and a Delete button.
//
// Such an entry can't be made through the extension any more (that is the
// point), so this spec writes it into IndexedDB from a dashboard page, as an
// older version would have left it.

const REFUSED = {
  id: 'legacy-gender',
  question: 'What is your gender?',
  answer: 'Prefer not to say',
  employerOverrides: {},
  source: 'manual',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

test('a Saved Answer employ-me now refuses is shown to delete, and left out of the Fill and backups', async ({
  extension,
}) => {
  const page = await extension.openDashboard('saved-answers');
  await page.getByRole('button', { name: 'Add a Saved Answer' }).click();
  const editor = page.getByTestId('saved-answer-editor');
  await editor.getByTestId('field-question').fill('Why do you want to work here?');
  await editor.getByTestId('field-answer').fill('I like the problems you solve.');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('saved-answer')).toHaveCount(1);

  await putStoredSavedAnswer(page, REFUSED);
  await page.reload();

  // Listed apart, with a plain note and a Delete button; the rest of the page works as before.
  const refused = page.getByTestId('refused-saved-answer');
  await expect(refused).toContainText(REFUSED.question);
  await expect(refused.getByTestId('refused-note')).toContainText('isn’t used in a Fill, sent to the AI');
  await expect(refused).not.toContainText(REFUSED.answer);
  await expect(page.getByTestId('saved-answer')).toContainText('Why do you want to work here?');

  // What a Fill reads (and what Drafts are built from) leaves it out.
  const profile = (await sendToBackground(page, 'profile.get', {})) as {
    ok: boolean;
    value: { savedAnswers: { question: string }[] };
  };
  expect(profile.ok).toBe(true);
  expect(profile.value.savedAnswers.map((s) => s.question)).toEqual(['Why do you want to work here?']);

  // The backup exports, leaves it out, and says so.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Export everything' }).click();
  await expect(page.getByTestId('backup-skipped')).toContainText('1 Saved Answer was left out');
  const backup = await download(page, page.getByTestId('backup-download'));
  expect(backup.text).not.toContain(REFUSED.question);
  expect(backup.text).toContain('Why do you want to work here?');

  // Restoring an older backup that still holds one restores the rest, and says what it left out.
  const older = { ...testBackup(), savedAnswers: [...testBackup().savedAnswers, REFUSED] };
  await page
    .getByTestId('backup-file')
    .setInputFiles(fileOf('older.json', JSON.stringify(older), 'application/json'));
  await page.getByRole('dialog').getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByTestId('toasts')).toContainText('1 Saved Answer was left out');

  // The restore replaced everything employ-me had, the refused entry included.
  await page.getByRole('link', { name: 'Saved Answers' }).click();
  await expect(refused).toHaveCount(0);
  expect(extension.errors).toEqual([]);
});

test('Delete removes a refused Saved Answer', async ({ extension }) => {
  const page = await extension.openDashboard('saved-answers');
  await expect(page.getByText('No Saved Answers yet')).toBeVisible();
  await putStoredSavedAnswer(page, REFUSED);
  await page.reload();
  const refused = page.getByTestId('refused-saved-answer');
  await refused.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(refused).toHaveCount(0);
  await expect(page.getByTestId('toasts')).toContainText('Saved Answer deleted.');
  expect(extension.errors).toEqual([]);
});

/** Writes a record straight into the Saved Answers store, once the dashboard has opened the database. */
async function putStoredSavedAnswer(page: Page, record: object): Promise<void> {
  await page.evaluate(async (stored) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('employ-me');
      open.onsuccess = () => {
        resolve(open.result);
      };
      open.onerror = () => {
        reject(new Error('open failed'));
      };
    });
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('savedAnswers', 'readwrite');
      t.objectStore('savedAnswers').put(stored);
      t.oncomplete = () => {
        resolve();
      };
      t.onerror = () => {
        reject(new Error('put failed'));
      };
    });
    db.close();
  }, record);
}
