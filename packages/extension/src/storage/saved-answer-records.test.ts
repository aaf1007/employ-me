import { describe, expect, it } from 'vitest';
import { STORES } from './idb';
import { createTestStore, failure, value } from './test-store';

// A Saved Answer stored before the guardrail hardening refused its kind of
// question now fails core's savedAnswerSchema. It is quarantined, not
// corrupt: the Fill, the Provider and backups never see it, and the Saved
// Answers page lists it for you to delete.

const STORED = {
  answer: 'Prefer not to say',
  employerOverrides: {},
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

function putRaw(db: IDBDatabase, records: readonly object[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES.savedAnswers, 'readwrite');
    for (const record of records) t.objectStore(STORES.savedAnswers).put(record);
    t.oncomplete = () => {
      resolve();
    };
    t.onerror = () => {
      reject(new Error('put failed', { cause: t.error }));
    };
  });
}

async function storeWithRefused() {
  const test = await createTestStore();
  const why = value(await test.store.addSavedAnswer({ question: 'Why us?', answer: 'Because.' }));
  await putRaw(test.db, [
    { ...STORED, id: 'old-gender', question: 'What is your gender?', source: 'manual' },
    {
      ...STORED,
      id: 'old-draft',
      question: 'Tell us about you',
      source: 'draft',
      fieldType: 'selfId.us.race',
    },
  ]);
  return { ...test, why };
}

describe('a Saved Answer employ-me now refuses', () => {
  it('is left out of the Saved Answers a Fill uses, and listed on its own to delete', async () => {
    const { store, why } = await storeWithRefused();
    expect(value(await store.listSavedAnswers()).map((s) => s.id)).toEqual([why.id]);
    expect(value(await store.listRefusedSavedAnswers())).toEqual([
      { id: 'old-draft', question: 'Tell us about you' },
      { id: 'old-gender', question: 'What is your gender?' },
    ]);
  });

  it('never reaches the Profile a Fill and the Provider read', async () => {
    const { store, why } = await storeWithRefused();
    const profile = value(await store.getProfile());
    expect(profile.savedAnswers.map((s) => s.id)).toEqual([why.id]);
    expect(JSON.stringify(profile)).not.toContain('Prefer not to say');
  });

  it('is left out of the backup, which says how many it left out', async () => {
    const { store, why } = await storeWithRefused();
    const exported = value(await store.exportBackup());
    expect(exported.skippedSavedAnswers).toBe(2);
    expect(exported.backup.savedAnswers.map((s) => s.id)).toEqual([why.id]);
    expect(JSON.stringify(exported.backup)).not.toContain('Prefer not to say');
  });

  it('can be deleted, and nothing else changes', async () => {
    const { store, why, changes } = await storeWithRefused();
    value(await store.deleteSavedAnswer('old-gender'));
    expect(changes.at(-1)).toBe('savedAnswers');
    expect(value(await store.listRefusedSavedAnswers()).map((r) => r.id)).toEqual(['old-draft']);
    expect(value(await store.listSavedAnswers()).map((s) => s.id)).toEqual([why.id]);
  });

  it('does not block writing other Saved Answers', async () => {
    const { store } = await storeWithRefused();
    value(await store.addSavedAnswer({ question: 'Favourite tool?', answer: 'A good editor.' }));
    expect(value(await store.listSavedAnswers())).toHaveLength(2);
  });

  it('is still corrupt when something else about it is damaged', async () => {
    const { store, db } = await createTestStore();
    await putRaw(db, [{ ...STORED, id: 'x', question: 'SSN', source: 'manual', createdAt: 'yesterday' }]);
    expect(failure(await store.listSavedAnswers()).reason).toBe('corrupt');
    expect(failure(await store.listRefusedSavedAnswers()).reason).toBe('corrupt');
    expect(failure(await store.exportBackup()).reason).toBe('corrupt');
  });
});
