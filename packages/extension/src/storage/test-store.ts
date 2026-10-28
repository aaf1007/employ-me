import type { Posting, Result } from '@employ-me/core';
import { IDBFactory } from 'fake-indexeddb';
import { expect } from 'vitest';
import type { Topic } from './context';
import { openDb } from './idb';
import { createDataStore, type DataStore } from './store';

// Test support for the data layer: a fresh in-memory IndexedDB per store, a
// clock that ticks one second per call and sequential ids. Only *.test.ts
// files import this module.

export interface TestStore {
  readonly store: DataStore;
  readonly db: IDBDatabase;
  readonly factory: IDBFactory;
  /** Every topic notified, in order. */
  readonly changes: Topic[];
}

export async function createTestStore(factory = new IDBFactory()): Promise<TestStore> {
  const db = await openDb(factory);
  const changes: Topic[] = [];
  let tick = 0;
  let id = 0;
  const store = createDataStore(db, {
    now: () => new Date(Date.UTC(2026, 9, 27, 12, 0, tick++)),
    newId: () => `id-${String(++id)}`,
    notify: (topics) => changes.push(...topics),
  });
  return { store, db, factory, changes };
}

/** The value of an ok Result, failing the test otherwise. */
export function value<T, E>(result: Result<T, E>): T {
  if (!result.ok) expect.fail(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}

/** The error of a failed Result, failing the test otherwise. */
export function failure<T, E>(result: Result<T, E>): E {
  if (result.ok) expect.fail('expected an error');
  return result.error;
}

export function posting(jobId: string, overrides: Partial<Posting> = {}): Posting {
  return {
    key: { ats: 'greenhouse', employer: 'acme', jobId },
    url: `https://job-boards.greenhouse.io/acme/jobs/${jobId}`,
    title: 'Software Engineer',
    company: 'Acme',
    location: 'Toronto, ON',
    country: 'CA',
    ...overrides,
  };
}

export function textFile(text: string, type = 'text/plain'): Blob {
  return new Blob([text], { type });
}
