import { ok, postingKeyId, type Application } from '@employ-me/core';
import { build, putApplication } from './application-record';
import { guarded, type DataResult, type StoreContext } from './context';
import { dataError } from './errors';
import { BY_POSTING, inTransaction, requestValue, STORES } from './idb';
import type { ImportedApplication } from './schemas';

export interface ImportOutcome {
  readonly added: number;
  /** Positions in the input that were skipped because the Tracker already has that Posting. */
  readonly duplicates: readonly number[];
}

/** Adds imported Applications in one go, skipping Postings the Tracker already has. */
export function importApplications(
  ctx: StoreContext,
  inputs: readonly ImportedApplication[],
): Promise<DataResult<ImportOutcome>> {
  return guarded(async () => {
    const built: Application[] = [];
    for (const [index, input] of inputs.entries()) {
      const one = build(ctx, input);
      if (!one.ok) {
        return dataError(
          'invalidInput',
          `Row ${String(index + 1)} is invalid`,
          (one.error.issues ?? []).map((issue) => ({ ...issue, path: `${String(index)}.${issue.path}` })),
        );
      }
      built.push(one.value);
    }
    const outcome = await inTransaction(
      ctx.db,
      [STORES.applications, STORES.snapshots],
      'readwrite',
      async (t) => {
        const index = t.objectStore(STORES.applications).index(BY_POSTING);
        const seen = new Set<string>();
        const duplicates: number[] = [];
        for (const [position, application] of built.entries()) {
          const key = postingKeyId(application.posting.key);
          const existing = await requestValue(index.getKey(key));
          if (existing !== undefined || seen.has(key)) {
            duplicates.push(position);
            continue;
          }
          seen.add(key);
          await putApplication(t, application);
        }
        return { added: built.length - duplicates.length, duplicates };
      },
    );
    if (outcome.added > 0) ctx.notify(['applications']);
    return ok(outcome);
  });
}
