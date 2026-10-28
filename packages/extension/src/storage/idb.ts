// A thin promise layer over IndexedDB. Everything employ-me keeps lives in
// one database in the extension's origin, shared by the dashboard, the side
// panel and the background (design.md "Your data stays on your machine").

export const DB_NAME = 'employ-me';
export const DB_VERSION = 1;

export const STORES = {
  /** Single records: the Profile's own fields and Settings, by KV_KEYS. */
  kv: 'kv',
  /** ResumeMeta by id. */
  resumes: 'resumes',
  /** Each Resume's file as a Blob, keyed by the Resume's id. */
  resumeFiles: 'resumeFiles',
  /** SavedAnswer by id. */
  savedAnswers: 'savedAnswers',
  /** Applications without their Snapshot, by id, indexed by Posting. */
  applications: 'applications',
  /** Each Application's Snapshot, keyed by the Application's id. */
  snapshots: 'snapshots',
} as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];
export const ALL_STORES: readonly StoreName[] = Object.values(STORES);

export const KV_KEYS = { profile: 'profile', settings: 'settings' } as const;

/** Index on applications by `postingKeyId(posting.key)`, for the already-applied warning. */
export const BY_POSTING = 'byPosting';

export function openDb(factory: IDBFactory, name: string = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore(STORES.kv);
        db.createObjectStore(STORES.resumes, { keyPath: 'id' });
        db.createObjectStore(STORES.resumeFiles);
        db.createObjectStore(STORES.savedAnswers, { keyPath: 'id' });
        const applications = db.createObjectStore(STORES.applications, { keyPath: 'id' });
        applications.createIndex(BY_POSTING, 'postingKeyId');
        db.createObjectStore(STORES.snapshots);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer version of the extension wants to upgrade: let it.
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
    request.onerror = () => {
      reject(new Error('Could not open the employ-me database', { cause: request.error }));
    };
    request.onblocked = () => {
      reject(new Error('The employ-me database is open in an older version of the extension'));
    };
  });
}

/** For requests with a typed result: put, delete, clear, getKey, getAllKeys. */
export function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new DOMException('IndexedDB request failed', 'UnknownError'));
    };
  });
}

// IndexedDB types `get` and `getAll` results as `any`. These hand them back
// as `unknown`, so every value read has to go through a schema.

export function readValue(request: IDBRequest): Promise<unknown> {
  return requestValue<unknown>(request);
}

export function readValues(request: IDBRequest<unknown[]>): Promise<unknown[]> {
  return requestValue(request);
}

type Outcome = { readonly ok: true } | { readonly ok: false; readonly error: DOMException };

/**
 * Runs `body` in one transaction and resolves once it has committed. If
 * `body` throws, the transaction is aborted and the error rethrown, so
 * nothing it wrote is kept.
 *
 * Only await IndexedDB requests inside `body`: awaiting anything else (a
 * Blob read, a timer) lets the transaction auto-commit underneath it.
 */
export async function inTransaction<T>(
  db: IDBDatabase,
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  body: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const transaction = db.transaction(stores, mode);
  const state = { finished: false };
  // Resolves either way, so an abort we cause never becomes an unhandled rejection.
  const outcome = new Promise<Outcome>((resolve) => {
    transaction.oncomplete = () => {
      state.finished = true;
      resolve({ ok: true });
    };
    transaction.onabort = () => {
      state.finished = true;
      resolve({
        ok: false,
        error: transaction.error ?? new DOMException('The transaction was aborted', 'AbortError'),
      });
    };
  });

  let value: T;
  try {
    value = await body(transaction);
  } catch (error) {
    if (!state.finished) transaction.abort();
    throw error;
  }
  const result = await outcome;
  if (!result.ok) throw result.error;
  return value;
}
