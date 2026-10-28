import { describe, expect, it } from 'vitest';
import { createTestStore, failure, textFile, value } from './test-store';

describe('Profile', () => {
  it('starts empty, with every Self-ID Answer declined', async () => {
    const { store } = await createTestStore();
    const profile = value(await store.getProfile());
    expect(profile.identity).toBeUndefined();
    expect(profile.resumes).toEqual([]);
    expect(profile.savedAnswers).toEqual([]);
    expect(Object.values(profile.selfId.US).every((answer) => answer === 'decline')).toBe(true);
    expect(Object.values(profile.selfId.CA).every((answer) => answer === 'decline')).toBe(true);
  });

  it('saves its fields and reads them back as core Profile, with Resumes and Saved Answers', async () => {
    const { store, changes } = await createTestStore();
    value(
      await store.saveProfileFields({
        schemaVersion: 1,
        identity: { legalName: { first: 'Sam', last: 'Lee' } },
        contact: { email: 'sam@example.com' },
        countries: ['CA', 'US'],
        workAuthorization: { CA: { authorizedNow: true, sponsorship: 'no' } },
        preferences: { salary: { CA: { currency: 'CAD', min: 90000, period: 'year' } } },
      }),
    );
    value(await store.addResume({ label: 'Main', fileName: 'sam.txt', file: textFile('Sam Lee') }));
    value(await store.addSavedAnswer({ question: 'Why us?', answer: 'Because.' }));

    const profile = value(await store.getProfile());
    expect(profile.identity?.legalName).toEqual({ first: 'Sam', last: 'Lee' });
    expect(profile.workAuthorization['CA']?.sponsorship).toBe('no');
    expect(profile.preferences.salary['CA']?.currency).toBe('CAD');
    expect(profile.resumes.map((r) => r.label)).toEqual(['Main']);
    expect(profile.savedAnswers.map((s) => s.question)).toEqual(['Why us?']);
    expect(changes).toEqual(['profile', 'resumes', 'savedAnswers']);
  });

  it('saving the Profile never touches Saved Answers kept meanwhile', async () => {
    const { store } = await createTestStore();
    const before = value(await store.getProfileFields());
    value(await store.addSavedAnswer({ question: 'Why us?', answer: 'Because.' }));
    value(await store.saveProfileFields({ ...before, countries: ['US'] }));
    expect(value(await store.getProfile()).savedAnswers).toHaveLength(1);
  });

  it.each([
    ['date of birth', { identity: { legalName: { first: 'A', last: 'B' }, dateOfBirth: '2000-01-01' } }],
    ['a SIN', { identity: { legalName: { first: 'A', last: 'B' }, sin: '123456789' } }],
    ['a password', { contact: { email: 'a@example.com', password: 'hunter2' } }],
  ])('refuses to store %s', async (_name, extra) => {
    const { store, changes } = await createTestStore();
    const error = failure(await store.saveProfileFields({ schemaVersion: 1, ...extra }));
    expect(error.reason).toBe('invalidInput');
    expect(changes).toEqual([]);
  });

  it('reports invalid fields by path, without the values', async () => {
    const { store } = await createTestStore();
    const error = failure(
      await store.saveProfileFields({
        schemaVersion: 1,
        identity: { legalName: { first: 'Sam', last: '' } },
        contact: { email: 'not-an-email' },
      }),
    );
    expect(error.issues).toEqual([
      { path: 'identity.legalName.last', message: 'Required' },
      { path: 'contact.email', message: 'Enter an email address, like sam@example.com' },
    ]);
    expect(JSON.stringify(error)).not.toContain('not-an-email');
  });

  it('reports stored data that no longer parses as corrupt, not as a crash', async () => {
    const { store, db } = await createTestStore();
    await new Promise<void>((resolve) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put({ schemaVersion: 1, identity: 'garbage' }, 'profile');
      t.oncomplete = () => {
        resolve();
      };
    });
    expect(failure(await store.getProfile()).reason).toBe('corrupt');
  });
});

describe('Settings', () => {
  it('default to Claude with each Provider on its default model', async () => {
    const { store } = await createTestStore();
    expect(value(await store.getSettings())).toEqual({ provider: 'claude', models: {} });
  });

  it('save the Provider and model, and refuse a model that could be a CLI flag', async () => {
    const { store } = await createTestStore();
    value(await store.saveSettings({ provider: 'codex', models: { codex: 'gpt-5-codex' } }));
    expect(value(await store.getSettings())).toMatchObject({
      provider: 'codex',
      models: { codex: 'gpt-5-codex' },
    });
    expect(failure(await store.saveSettings({ models: { claude: '--yolo' } })).reason).toBe('invalidInput');
  });
});
