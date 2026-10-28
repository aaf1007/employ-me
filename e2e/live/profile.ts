import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, type LiveExtension } from './harness';
import { LIVE_DIR, type LiveProvider } from './ledger';

// The persona's Profile, as setup.live.ts left it: a backup downloaded from
// Settings once setup is done, restored the same way before every Fill.

export const PERSONA_BACKUP = path.join(LIVE_DIR, 'persona-backup.json');

interface Backup {
  readonly settings: Record<string, unknown>;
}

/** Restores the persona's backup, with `provider` picked in Settings. */
export async function restorePersona(extension: LiveExtension, provider: LiveProvider): Promise<Page> {
  let text: string;
  try {
    text = await readFile(PERSONA_BACKUP, 'utf8');
  } catch (cause) {
    throw new Error(`No persona backup at ${PERSONA_BACKUP}: run setup.live.ts first.`, { cause });
  }
  const backup = JSON.parse(text) as Backup;
  const withProvider = { ...backup, settings: { ...backup.settings, provider } };
  const page = await extension.openDashboard('settings');
  await page.getByTestId('backup-file').setInputFiles({
    name: 'employ-me-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(withProvider)),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByTestId('toasts')).toContainText('Backup restored');
  return page;
}
