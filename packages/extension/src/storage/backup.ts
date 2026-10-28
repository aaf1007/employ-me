import {
  applicationSchema,
  isoDateTimeSchema,
  ok,
  resumeMetaSchema,
  savedAnswerSchema,
  snapshotSchema,
  type Application,
} from '@employ-me/core';
import { z } from 'zod';
import { putApplication } from './application-record';
import { base64ToBlob, blobToBase64 } from './base64';
import {
  guarded,
  isoNow,
  parseAllStored,
  parseStored,
  TOPICS,
  type DataResult,
  type StoreContext,
} from './context';
import { dataError, issuesFrom } from './errors';
import {
  ALL_STORES,
  inTransaction,
  KV_KEYS,
  readValue,
  readValues,
  requestValue,
  STORES,
  type StoreName,
} from './idb';
import { emptyProfileFields } from './profile-store';
import { sortSavedAnswerRecords, withoutRefused } from './saved-answer-records';
import { profileFieldsSchema, settingsSchema, storedApplicationSchema } from './schemas';

// A full backup: everything employ-me keeps, Resume files included, as one
// JSON file (design.md "You can export and import it as JSON or CSV").

export const BACKUP_FORMAT = 'employ-me-backup';
export const BACKUP_VERSION = 1;

const backupResumeSchema = resumeMetaSchema.extend({ dataBase64: z.base64() });

const uniqueIds = (items: readonly { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

export const backupSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: isoDateTimeSchema,
  profile: profileFieldsSchema,
  settings: settingsSchema,
  resumes: z
    .array(backupResumeSchema)
    .refine(uniqueIds, 'Two Resumes share an id')
    .refine((resumes) => resumes.length === 0 || resumes.filter((r) => r.isDefault).length === 1, {
      message: 'Exactly one Resume must be the default',
    }),
  savedAnswers: z.array(savedAnswerSchema).refine(uniqueIds, 'Two Saved Answers share an id'),
  applications: z.array(applicationSchema).refine(uniqueIds, 'Two Applications share an id'),
});
export type Backup = z.infer<typeof backupSchema>;

/** Enough to tell a backup from another file; the rest is checked whole, with backupSchema. */
const backupHeaderSchema = z.looseObject({ format: z.literal(BACKUP_FORMAT) });
const backupSavedAnswersSchema = z.object({ savedAnswers: z.array(z.unknown()) });

export interface BackupCounts {
  readonly resumes: number;
  readonly savedAnswers: number;
  readonly applications: number;
  /** Refused Saved Answers left out (see saved-answer-records.ts). */
  readonly skippedSavedAnswers: number;
}

export interface ExportedBackup {
  readonly backup: Backup;
  /** Refused Saved Answers left out of the file. */
  readonly skippedSavedAnswers: number;
}

export function exportBackup(ctx: StoreContext): Promise<DataResult<ExportedBackup>> {
  return guarded(async () => {
    const raw = await inTransaction(ctx.db, ALL_STORES, 'readonly', async (t) => {
      const store = (name: StoreName) => t.objectStore(name);
      const [profile, settings, metas, fileKeys, files, answers, applications, snapshotKeys, snapshots] =
        await Promise.all([
          readValue(store(STORES.kv).get(KV_KEYS.profile)),
          readValue(store(STORES.kv).get(KV_KEYS.settings)),
          readValues(store(STORES.resumes).getAll()),
          requestValue(store(STORES.resumeFiles).getAllKeys()),
          readValues(store(STORES.resumeFiles).getAll()),
          readValues(store(STORES.savedAnswers).getAll()),
          readValues(store(STORES.applications).getAll()),
          requestValue(store(STORES.snapshots).getAllKeys()),
          readValues(store(STORES.snapshots).getAll()),
        ]);
      return { profile, settings, metas, fileKeys, files, answers, applications, snapshotKeys, snapshots };
    });

    const profile =
      raw.profile === undefined
        ? ok(emptyProfileFields())
        : parseStored(profileFieldsSchema, raw.profile, 'Profile');
    if (!profile.ok) return profile;
    const settings = parseStored(settingsSchema, raw.settings ?? {}, 'Settings');
    if (!settings.ok) return settings;
    const metas = parseAllStored(resumeMetaSchema, raw.metas, 'Resume');
    if (!metas.ok) return metas;
    // A refused Saved Answer is quarantined: it never leaves the machine in a backup either.
    const answers = sortSavedAnswerRecords(raw.answers);
    if (!answers.ok) return answers;
    const summaries = parseAllStored(storedApplicationSchema, raw.applications, 'Application');
    if (!summaries.ok) return summaries;
    const snapshots = parseAllStored(snapshotSchema, raw.snapshots, 'Snapshot');
    if (!snapshots.ok) return snapshots;

    const files = new Map(raw.fileKeys.map((key, index) => [keyString(key), raw.files[index]]));
    const resumes: z.input<typeof backupResumeSchema>[] = [];
    for (const meta of metas.value) {
      const file = files.get(meta.id);
      if (!(file instanceof Blob)) return dataError('corrupt', 'A Resume file is missing');
      resumes.push({ ...meta, dataBase64: await blobToBase64(file) });
    }

    const snapshotById = new Map(
      raw.snapshotKeys.map((key, index) => [keyString(key), snapshots.value[index]]),
    );
    const applications: Application[] = summaries.value.map(
      ({ hasSnapshot: _has, postingKeyId: _key, ...rest }) => {
        const snapshot = snapshotById.get(rest.id);
        return snapshot === undefined ? rest : { ...rest, snapshot };
      },
    );

    const backup = parseStored(
      backupSchema,
      {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: isoNow(ctx),
        profile: profile.value,
        settings: settings.value,
        resumes,
        savedAnswers: answers.value.usable,
        applications,
      },
      'backup',
    );
    return backup.ok
      ? ok({ backup: backup.value, skippedSavedAnswers: answers.value.refused.length })
      : backup;
  });
}

/**
 * Restores a backup, replacing everything employ-me keeps. The whole file is
 * checked first; if any of it is invalid, nothing changes.
 */
export function importBackup(ctx: StoreContext, raw: unknown): Promise<DataResult<BackupCounts>> {
  return guarded(async () => {
    const header = backupHeaderSchema.safeParse(raw);
    if (!header.success) {
      return dataError('invalidInput', "This file isn't an employ-me backup", [
        { path: 'file', message: 'Choose a file exported from employ-me Settings' },
      ]);
    }
    // A backup made before employ-me refused Self-ID, Attestation and never-stored questions may
    // hold Saved Answers to them: those are left out, and the rest restores.
    const answers = backupSavedAnswersSchema.safeParse(raw);
    const { kept, skipped } = withoutRefused(answers.success ? answers.data.savedAnswers : []);
    const parsed = backupSchema.safeParse(answers.success ? { ...header.data, savedAnswers: kept } : raw);
    if (!parsed.success) {
      return dataError('invalidInput', 'The backup has invalid data', issuesFrom(parsed.error));
    }
    const backup = parsed.data;
    const files = backup.resumes.map((resume) => base64ToBlob(resume.dataBase64, resume.mimeType));
    const mismatched = backup.resumes.find((resume, index) => files[index]?.size !== resume.sizeBytes);
    if (mismatched !== undefined) {
      return dataError('invalidInput', 'A Resume file in the backup is damaged', [
        { path: 'resumes', message: 'A Resume file is not the size the backup says it is' },
      ]);
    }

    await inTransaction(ctx.db, ALL_STORES, 'readwrite', async (t) => {
      for (const store of ALL_STORES) await requestValue(t.objectStore(store).clear());
      const kv = t.objectStore(STORES.kv);
      await requestValue(kv.put(backup.profile, KV_KEYS.profile));
      await requestValue(kv.put(backup.settings, KV_KEYS.settings));
      for (const [index, { dataBase64: _data, ...meta }] of backup.resumes.entries()) {
        await requestValue(t.objectStore(STORES.resumes).put(meta));
        await requestValue(t.objectStore(STORES.resumeFiles).put(files[index], meta.id));
      }
      for (const answer of backup.savedAnswers)
        await requestValue(t.objectStore(STORES.savedAnswers).put(answer));
      for (const application of backup.applications) await putApplication(t, application);
    });
    ctx.notify(TOPICS);
    return ok({
      resumes: backup.resumes.length,
      savedAnswers: backup.savedAnswers.length,
      applications: backup.applications.length,
      skippedSavedAnswers: skipped,
    });
  });
}

// Every key employ-me writes is an id string.
function keyString(key: IDBValidKey): string {
  return typeof key === 'string' ? key : '';
}

/** The backup's file name: employ-me-backup-2026-10-27.json. */
export function backupFileName(exportedAt: string): string {
  return `${BACKUP_FORMAT}-${exportedAt.slice(0, 10)}.json`;
}
