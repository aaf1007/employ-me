import {
  ok,
  postingKeyId,
  snapshotSchema,
  type Application,
  type PostingKey,
  type Status,
} from '@employ-me/core';
import { build, fromStored, newestFirst, putApplication } from './application-record';
import { guarded, parseAllStored, parseStored, type DataResult, type StoreContext } from './context';
import { dataError, issuesFrom } from './errors';
import { BY_POSTING, inTransaction, readValue, readValues, requestValue, STORES } from './idb';
import { storedApplicationSchema, type ApplicationSummary, type NewApplication } from './schemas';

export interface ApplicationChanges {
  readonly status?: Status;
  readonly notes?: string;
}

/** Every Application, newest first, without Snapshots. */
export function listApplications(ctx: StoreContext): Promise<DataResult<ApplicationSummary[]>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.applications], 'readonly', async (t) => {
      const all = parseAllStored(
        storedApplicationSchema,
        await readValues(t.objectStore(STORES.applications).getAll()),
        'Application',
      );
      return all.ok ? ok(all.value.map(fromStored).sort(newestFirst)) : all;
    }),
  );
}

/** One Application with its Snapshot. */
export function getApplication(ctx: StoreContext, id: string): Promise<DataResult<Application>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.applications, STORES.snapshots], 'readonly', async (t) => {
      const [stored, snapshot] = await Promise.all([
        readValue(t.objectStore(STORES.applications).get(id)),
        readValue(t.objectStore(STORES.snapshots).get(id)),
      ]);
      if (stored === undefined) return dataError('notFound', 'That Application no longer exists');
      const summary = parseStored(storedApplicationSchema, stored, 'Application');
      if (!summary.ok) return summary;
      const { hasSnapshot: _has, postingKeyId: _key, ...rest } = summary.value;
      if (snapshot === undefined) return ok(rest);
      const parsedSnapshot = parseStored(snapshotSchema, snapshot, 'Snapshot');
      return parsedSnapshot.ok ? ok({ ...rest, snapshot: parsedSnapshot.value }) : parsedSnapshot;
    }),
  );
}

/** Applications for this Posting: same ATS, employer and job id. Feeds the already-applied warning. */
export function findApplicationsByPosting(
  ctx: StoreContext,
  key: PostingKey,
): Promise<DataResult<ApplicationSummary[]>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.applications], 'readonly', async (t) => {
      const index = t.objectStore(STORES.applications).index(BY_POSTING);
      const all = parseAllStored(
        storedApplicationSchema,
        await readValues(index.getAll(postingKeyId(key))),
        'Application',
      );
      return all.ok ? ok(all.value.map(fromStored).sort(newestFirst)) : all;
    }),
  );
}

export function createApplication(
  ctx: StoreContext,
  input: NewApplication,
): Promise<DataResult<Application>> {
  return guarded(async () => {
    const built = build(ctx, input);
    if (!built.ok) return built;
    const application = built.value;
    await inTransaction(ctx.db, [STORES.applications, STORES.snapshots], 'readwrite', async (t) => {
      await putApplication(t, application);
    });
    ctx.notify(['applications']);
    return ok(application);
  });
}

/** Your changes to an Application: its Status and notes. Only you change the Status. */
export function updateApplication(
  ctx: StoreContext,
  id: string,
  changes: ApplicationChanges,
): Promise<DataResult<ApplicationSummary>> {
  return guarded(async () => {
    const result = await inTransaction(ctx.db, [STORES.applications], 'readwrite', async (t) => {
      const store = t.objectStore(STORES.applications);
      const stored: unknown = await readValue(store.get(id));
      if (stored === undefined) return dataError('notFound', 'That Application no longer exists');
      const current = parseStored(storedApplicationSchema, stored, 'Application');
      if (!current.ok) return current;
      const next = storedApplicationSchema.safeParse({ ...current.value, ...changes });
      if (!next.success) {
        return dataError('invalidInput', 'The Application is invalid', issuesFrom(next.error));
      }
      await requestValue(store.put(next.data));
      return ok(fromStored(next.data));
    });
    if (result.ok) ctx.notify(['applications']);
    return result;
  });
}

export function deleteApplication(ctx: StoreContext, id: string): Promise<DataResult<null>> {
  return guarded(async () => {
    const found = await inTransaction(
      ctx.db,
      [STORES.applications, STORES.snapshots],
      'readwrite',
      async (t) => {
        const store = t.objectStore(STORES.applications);
        if ((await requestValue(store.getKey(id))) === undefined) return false;
        await requestValue(store.delete(id));
        await requestValue(t.objectStore(STORES.snapshots).delete(id));
        return true;
      },
    );
    if (!found) return dataError('notFound', 'That Application no longer exists');
    ctx.notify(['applications']);
    return ok(null);
  });
}
