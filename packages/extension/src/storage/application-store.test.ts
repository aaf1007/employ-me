import type { Snapshot } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { createTestStore, failure, posting, value } from './test-store';

const snapshot: Snapshot = {
  capturedAt: '2026-10-27T12:00:00Z',
  postingDescription: 'Build things.',
  answers: [{ label: 'First name', fieldType: 'name.first', value: 'Sam' }],
  resume: { id: 'r1', label: 'Main', fileName: 'sam.pdf' },
};

describe('Applications', () => {
  it('records a confirmed submission at Applied, with its Snapshot kept apart from the list', async () => {
    const { store, changes } = await createTestStore();
    const created = value(
      await store.createApplication({ source: 'confirmation', posting: posting('1'), snapshot }),
    );
    expect(created).toMatchObject({ status: 'applied', notes: '', source: 'confirmation', snapshot });

    const [summary] = value(await store.listApplications());
    expect(summary).toMatchObject({ id: created.id, hasSnapshot: true });
    expect(summary).not.toHaveProperty('snapshot');
    expect(value(await store.getApplication(created.id)).snapshot).toEqual(snapshot);
    expect(changes).toEqual(['applications']);
  });

  it('adds one by hand with your Status and notes, and no Snapshot', async () => {
    const { store } = await createTestStore();
    const created = value(
      await store.createApplication({
        source: 'manual',
        posting: posting('2'),
        appliedAt: '2026-10-01T09:00:00-07:00',
        status: 'interviewing',
        notes: 'Recruiter: Pat',
      }),
    );
    expect(created).toMatchObject({ status: 'interviewing', notes: 'Recruiter: Pat' });
    expect(created).not.toHaveProperty('snapshot');
    expect(value(await store.listApplications())[0]?.hasSnapshot).toBe(false);
  });

  it('lists newest first, comparing instants rather than strings', async () => {
    const { store } = await createTestStore();
    // 18:00 at UTC-7 is 01:00 UTC the next day: later, though it sorts earlier as text.
    value(
      await store.createApplication({
        source: 'manual',
        posting: posting('a'),
        appliedAt: '2026-10-01T18:00:00-07:00',
      }),
    );
    value(
      await store.createApplication({
        source: 'manual',
        posting: posting('b'),
        appliedAt: '2026-10-01T23:00:00Z',
      }),
    );
    expect(value(await store.listApplications()).map((a) => a.posting.key.jobId)).toEqual(['a', 'b']);
  });

  it('changes Status and notes, and nothing else', async () => {
    const { store } = await createTestStore();
    const created = value(await store.createApplication({ source: 'manual', posting: posting('3') }));
    const updated = value(await store.updateApplication(created.id, { status: 'offer', notes: 'Yay' }));
    expect(updated).toMatchObject({ status: 'offer', notes: 'Yay', posting: created.posting });
    expect(failure(await store.updateApplication('missing', { status: 'offer' })).reason).toBe('notFound');
  });

  it('finds Applications for a Posting by ATS, employer and job id', async () => {
    const { store } = await createTestStore();
    value(await store.createApplication({ source: 'confirmation', posting: posting('4'), snapshot }));
    value(await store.createApplication({ source: 'manual', posting: posting('5') }));
    const found = value(
      await store.findApplicationsByPosting({ ats: 'greenhouse', employer: 'ACME', jobId: '4' }),
    );
    expect(found.map((a) => a.posting.key.jobId)).toEqual(['4']);
    expect(
      value(await store.findApplicationsByPosting({ ats: 'lever', employer: 'acme', jobId: '4' })),
    ).toEqual([]);
  });

  it('deletes an Application together with its Snapshot', async () => {
    const { store } = await createTestStore();
    const created = value(
      await store.createApplication({ source: 'confirmation', posting: posting('6'), snapshot }),
    );
    value(await store.deleteApplication(created.id));
    expect(value(await store.listApplications())).toEqual([]);
    expect(failure(await store.getApplication(created.id)).reason).toBe('notFound');
    expect(value(await store.exportBackup()).applications).toEqual([]);
  });

  it('imports in one go, skipping Postings the Tracker already has', async () => {
    const { store, changes } = await createTestStore();
    value(await store.createApplication({ source: 'manual', posting: posting('7') }));
    const outcome = value(
      await store.importApplications([
        { source: 'import', posting: posting('7') },
        { source: 'import', posting: posting('8'), status: 'rejected' },
        { source: 'import', posting: posting('8') },
      ]),
    );
    expect(outcome).toEqual({ added: 1, duplicates: [0, 2] });
    const imported = value(await store.listApplications()).find((a) => a.posting.key.jobId === '8');
    expect(imported).toMatchObject({ source: 'import', status: 'rejected', hasSnapshot: false });
    expect(changes).toEqual(['applications', 'applications']);
  });

  it('imports nothing when any row is invalid', async () => {
    const { store } = await createTestStore();
    const error = failure(
      await store.importApplications([
        { source: 'import', posting: posting('9') },
        { source: 'import', posting: { ...posting('10'), url: 'not a url' } },
      ]),
    );
    expect(error.issues?.[0]?.path).toBe('1.posting.url');
    expect(value(await store.listApplications())).toEqual([]);
  });
});
