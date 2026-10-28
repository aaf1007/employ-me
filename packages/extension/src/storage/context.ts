import { ok, type Result } from '@employ-me/core';
import type { z } from 'zod';
import { dataError, type DataError } from './errors';

/** What changed, so open dashboard views and side panels can reload it. */
export const TOPICS = ['profile', 'resumes', 'savedAnswers', 'applications', 'settings'] as const;
export type Topic = (typeof TOPICS)[number];

export interface StoreDeps {
  readonly now: () => Date;
  readonly newId: () => string;
  /** Called after a write has committed. */
  readonly notify: (topics: readonly Topic[]) => void;
}

export interface StoreContext extends StoreDeps {
  readonly db: IDBDatabase;
}

export type DataResult<T> = Result<T, DataError>;

/**
 * Runs one data operation. IndexedDB failures (quota, a closed database)
 * become `storageFailed`; anything else is a bug and is rethrown.
 */
export async function guarded<T>(operation: () => Promise<DataResult<T>>): Promise<DataResult<T>> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DOMException) {
      return dataError('storageFailed', `IndexedDB failed: ${error.name}`);
    }
    throw error;
  }
}

/** Parses a record read back from IndexedDB. A failure means the stored data is damaged. */
export function parseStored<S extends z.ZodType>(
  schema: S,
  value: unknown,
  where: string,
): DataResult<z.infer<S>> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return ok(parsed.data);
  const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)');
  return dataError('corrupt', `Stored ${where} failed validation at ${paths.join(', ')}`);
}

/** Parses every record, or reports the first damaged one. */
export function parseAllStored<S extends z.ZodType>(
  schema: S,
  values: readonly unknown[],
  where: string,
): DataResult<z.infer<S>[]> {
  const parsed: z.infer<S>[] = [];
  for (const value of values) {
    const one = parseStored(schema, value, where);
    if (!one.ok) return one;
    parsed.push(one.value);
  }
  return ok(parsed);
}

export function isoNow(deps: Pick<StoreDeps, 'now'>): string {
  return deps.now().toISOString();
}
