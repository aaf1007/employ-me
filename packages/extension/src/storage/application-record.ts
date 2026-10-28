import { INITIAL_STATUS, applicationSchema, ok, postingKeyId, type Application } from '@employ-me/core';
import { isoNow, type DataResult, type StoreContext } from './context';
import { dataError, issuesFrom } from './errors';
import { requestValue, STORES } from './idb';
import type { ApplicationSummary, NewApplication, StoredApplication } from './schemas';

// How an Application is built, written and read back, shared by the
// Application store and CSV import.

/** Writes an Application (already validated) and its Snapshot inside `t`. */
export async function putApplication(t: IDBTransaction, application: Application): Promise<void> {
  const { snapshot, ...rest } = application;
  const stored: StoredApplication = {
    ...rest,
    hasSnapshot: snapshot !== undefined,
    postingKeyId: postingKeyId(application.posting.key),
  };
  await requestValue(t.objectStore(STORES.applications).put(stored));
  if (snapshot !== undefined)
    await requestValue(t.objectStore(STORES.snapshots).put(snapshot, application.id));
}

export function build(ctx: StoreContext, input: NewApplication): DataResult<Application> {
  const base = {
    id: ctx.newId(),
    posting: input.posting,
    appliedAt: input.appliedAt ?? isoNow(ctx),
    source: input.source,
  };
  const parsed = applicationSchema.safeParse(withStatus(base, input));
  return parsed.success
    ? ok(parsed.data)
    : dataError('invalidInput', 'The Application is invalid', issuesFrom(parsed.error));
}

/** A submission you confirmed starts at Applied with its Snapshot; one you add yourself takes your Status. */
function withStatus<B extends object>(base: B, input: NewApplication) {
  switch (input.source) {
    case 'confirmation':
    case 'didYouApply':
      return { ...base, status: INITIAL_STATUS, notes: '', snapshot: input.snapshot };
    case 'manual':
    case 'import':
      return { ...base, status: input.status ?? INITIAL_STATUS, notes: input.notes ?? '' };
  }
}

export function fromStored(stored: StoredApplication): ApplicationSummary {
  const { postingKeyId: _key, ...summary } = stored;
  return summary;
}

// appliedAt may carry any offset, so compare instants, not strings.
export function newestFirst(a: ApplicationSummary, b: ApplicationSummary): number {
  return Date.parse(b.appliedAt) - Date.parse(a.appliedAt);
}
