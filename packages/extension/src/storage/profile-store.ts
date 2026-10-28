import {
  PROFILE_SCHEMA_VERSION,
  ok,
  profileSchema,
  resumeMetaSchema,
  savedAnswerSchema,
  type Profile,
} from '@employ-me/core';
import { guarded, parseAllStored, parseStored, type DataResult, type StoreContext } from './context';
import { dataError, issuesFrom } from './errors';
import { inTransaction, KV_KEYS, readValue, readValues, requestValue, STORES } from './idb';
import {
  profileFieldsSchema,
  settingsSchema,
  type ProfileFields,
  type ProfileFieldsInput,
  type Settings,
  type SettingsInput,
} from './schemas';

export function emptyProfileFields(): ProfileFields {
  return profileFieldsSchema.parse({ schemaVersion: PROFILE_SCHEMA_VERSION });
}

export function getProfileFields(ctx: StoreContext): Promise<DataResult<ProfileFields>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.kv], 'readonly', async (t) => {
      const stored = await readValue(t.objectStore(STORES.kv).get(KV_KEYS.profile));
      return stored === undefined
        ? ok(emptyProfileFields())
        : parseStored(profileFieldsSchema, stored, 'Profile');
    }),
  );
}

/** Replaces the Profile's own fields. Strict: anything design.md says is never stored is refused. */
export function saveProfileFields(
  ctx: StoreContext,
  input: ProfileFieldsInput,
): Promise<DataResult<ProfileFields>> {
  return guarded(async () => {
    const parsed = profileFieldsSchema.safeParse(input);
    if (!parsed.success) {
      return dataError('invalidInput', 'The Profile has invalid fields', issuesFrom(parsed.error));
    }
    await inTransaction(ctx.db, [STORES.kv], 'readwrite', async (t) => {
      await requestValue(t.objectStore(STORES.kv).put(parsed.data, KV_KEYS.profile));
    });
    ctx.notify(['profile']);
    return ok(parsed.data);
  });
}

/** The whole Profile as core defines it, with Resumes and Saved Answers. This is what a Fill reads. */
export function getProfile(ctx: StoreContext): Promise<DataResult<Profile>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.kv, STORES.resumes, STORES.savedAnswers], 'readonly', async (t) => {
      const [stored, resumes, savedAnswers] = await Promise.all([
        readValue(t.objectStore(STORES.kv).get(KV_KEYS.profile)),
        readValues(t.objectStore(STORES.resumes).getAll()),
        readValues(t.objectStore(STORES.savedAnswers).getAll()),
      ]);
      const fields =
        stored === undefined ? ok(emptyProfileFields()) : parseStored(profileFieldsSchema, stored, 'Profile');
      if (!fields.ok) return fields;
      const metas = parseAllStored(resumeMetaSchema, resumes, 'Resume');
      if (!metas.ok) return metas;
      const answers = parseAllStored(savedAnswerSchema, savedAnswers, 'Saved Answer');
      if (!answers.ok) return answers;
      return parseStored(
        profileSchema,
        {
          ...fields.value,
          resumes: metas.value.sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
          savedAnswers: answers.value.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        },
        'Profile',
      );
    }),
  );
}

export function getSettings(ctx: StoreContext): Promise<DataResult<Settings>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.kv], 'readonly', async (t) => {
      const stored = await readValue(t.objectStore(STORES.kv).get(KV_KEYS.settings));
      return parseStored(settingsSchema, stored ?? {}, 'Settings');
    }),
  );
}

export function saveSettings(ctx: StoreContext, input: SettingsInput): Promise<DataResult<Settings>> {
  return guarded(async () => {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return dataError('invalidInput', 'Settings are invalid', issuesFrom(parsed.error));
    }
    await inTransaction(ctx.db, [STORES.kv], 'readwrite', async (t) => {
      await requestValue(t.objectStore(STORES.kv).put(parsed.data, KV_KEYS.settings));
    });
    ctx.notify(['settings']);
    return ok(parsed.data);
  });
}
