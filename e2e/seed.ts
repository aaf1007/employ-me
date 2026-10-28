import type { Page } from '@playwright/test';
import { expect, type Extension } from './harness';
import { TEST_PROFILE, TEST_RESUME, TEST_SAVED_ANSWERS } from './profile';

// Puts the test Profile, its Saved Answers and its Resume into the
// extension's own storage, the way a person would: by restoring a backup
// from the dashboard's Settings. Obviously fake data (CODING_STANDARDS.md "Privacy").

export function testBackup() {
  const { resumes: _resumes, savedAnswers: _saved, ...profile } = TEST_PROFILE;
  const pdf = Buffer.from(TEST_RESUME.pdf);
  return {
    format: 'employ-me-backup',
    version: 1,
    exportedAt: '2026-10-28T00:00:00Z',
    profile,
    settings: { provider: 'claude', models: {}, setupCompletedAt: '2026-10-28T00:00:00Z' },
    resumes: [{ ...TEST_RESUME.meta, sizeBytes: pdf.length, dataBase64: pdf.toString('base64') }],
    savedAnswers: TEST_SAVED_ANSWERS,
    applications: [],
  };
}

/** Restores the test backup and returns the dashboard page it used. */
export async function seedTestProfile(extension: Extension): Promise<Page> {
  const page = await extension.openDashboard('settings');
  await page.getByTestId('backup-file').setInputFiles({
    name: 'employ-me-backup-2026-10-28.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(testBackup())),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByTestId('toasts')).toContainText('Backup restored');
  return page;
}
