import { describe, expect, it } from 'vitest';
import { backupFileName } from './backup';
import { createTestStore, failure, posting, textFile, value } from './test-store';

async function filledStore() {
  const test = await createTestStore();
  const { store } = test;
  value(
    await store.saveProfileFields({
      schemaVersion: 1,
      identity: { legalName: { first: 'Sam', last: 'Lee' } },
      countries: ['US'],
      selfId: { US: { veteran: 'notProtectedVeteran' } },
    }),
  );
  value(await store.addResume({ label: 'Main', fileName: 'sam.txt', file: textFile('Sam Lee, resume') }));
  value(
    await store.addResume({
      label: 'Binary',
      fileName: 'sam.pdf',
      file: new Blob([new Uint8Array([0, 255, 37, 80, 68, 70])], { type: 'application/pdf' }),
      makeDefault: true,
    }),
  );
  value(
    await store.saveAcceptedDraft({
      question: 'Why us?',
      answer: 'Because.',
      fieldType: 'freeText.question',
    }),
  );
  value(
    await store.createApplication({
      source: 'confirmation',
      posting: posting('1'),
      snapshot: { capturedAt: '2026-10-27T12:00:00Z', postingDescription: 'JD', answers: [], resume: null },
    }),
  );
  value(await store.createApplication({ source: 'manual', posting: posting('2'), notes: 'Phone screen' }));
  value(await store.saveSettings({ provider: 'codex' }));
  return test;
}

describe('JSON backup', () => {
  it('round-trips everything, Resume files included, into an empty store', async () => {
    const { store } = await filledStore();
    const backup = value(await store.exportBackup());
    // Through JSON, as a file would be.
    const file: unknown = JSON.parse(JSON.stringify(backup));

    const { store: restored, changes } = await createTestStore();
    expect(value(await restored.importBackup(file))).toEqual({
      resumes: 2,
      savedAnswers: 1,
      applications: 2,
    });
    expect(changes).toEqual(['profile', 'resumes', 'savedAnswers', 'applications', 'settings']);

    expect(value(await restored.getProfile())).toEqual(value(await store.getProfile()));
    expect(value(await restored.listApplications())).toEqual(value(await store.listApplications()));
    expect(value(await restored.getSettings())).toEqual(value(await store.getSettings()));
    for (const meta of value(await store.listResumes())) {
      const original = new Uint8Array(await value(await store.getResumeFile(meta.id)).file.arrayBuffer());
      const copy = value(await restored.getResumeFile(meta.id)).file;
      expect(new Uint8Array(await copy.arrayBuffer())).toEqual(original);
      expect(copy.type).toBe(meta.mimeType);
    }
    const [withSnapshot] = value(await store.listApplications()).filter((a) => a.hasSnapshot);
    expect(value(await restored.getApplication(withSnapshot?.id ?? '')).snapshot?.postingDescription).toBe(
      'JD',
    );
  });

  it('replaces what was there', async () => {
    const { store } = await createTestStore();
    value(await store.addSavedAnswer({ question: 'Old question', answer: 'Old' }));
    const empty = value(await (await createTestStore()).store.exportBackup());
    value(await store.importBackup(empty));
    expect(value(await store.listSavedAnswers())).toEqual([]);
  });

  it('changes nothing when the backup is invalid', async () => {
    const { store } = await filledStore();
    const before = value(await store.exportBackup());
    const broken = { ...before, applications: [{ ...before.applications[0], status: 'ghosted' }] };
    expect(failure(await store.importBackup(broken)).reason).toBe('invalidInput');
    expect(value(await store.listApplications())).toHaveLength(2);
  });

  it('refuses a backup that holds a Saved Answer from a Self-ID field', async () => {
    const { store } = await filledStore();
    const backup = value(await store.exportBackup());
    const tampered = {
      ...backup,
      savedAnswers: backup.savedAnswers.map((s) => ({ ...s, fieldType: 'selfId.us.race' })),
    };
    expect(failure(await store.importBackup(tampered)).reason).toBe('invalidInput');
  });

  it('refuses a backup that holds a Saved Answer to a Self-ID or never-stored question', async () => {
    const { store } = await filledStore();
    const backup = value(await store.exportBackup());
    for (const question of ['Are you a protected veteran?', 'SSN', 'Date of birth']) {
      const tampered = {
        ...backup,
        savedAnswers: backup.savedAnswers.map((s) => ({ ...s, question, source: 'import' })),
      };
      expect(failure(await store.importBackup(tampered)).reason, question).toBe('invalidInput');
    }
    expect(value(await store.listSavedAnswers()).map((s) => s.question)).toEqual(['Why us?']);
  });

  it('refuses never-stored data, a damaged Resume file and files that are not backups', async () => {
    const { store } = await filledStore();
    const backup = value(await store.exportBackup());
    const withSin = { ...backup, profile: { ...backup.profile, sin: '123456789' } };
    expect(failure(await store.importBackup(withSin)).reason).toBe('invalidInput');

    const damaged = { ...backup, resumes: backup.resumes.map((r) => ({ ...r, sizeBytes: r.sizeBytes + 1 })) };
    expect(failure(await store.importBackup(damaged)).message).toBe('A Resume file in the backup is damaged');

    expect(failure(await store.importBackup({ hello: 'world' })).message).toBe(
      "This file isn't an employ-me backup",
    );
    expect(failure(await store.importBackup('nope')).reason).toBe('invalidInput');
  });

  it('is named by date', () => {
    expect(backupFileName('2026-10-27T12:00:00.000Z')).toBe('employ-me-backup-2026-10-27.json');
  });
});
