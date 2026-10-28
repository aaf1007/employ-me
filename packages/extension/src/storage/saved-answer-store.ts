import {
  labelsMatch,
  ok,
  savedAnswerSchema,
  type EmployerKey,
  type OrdinaryFieldType,
  type SavedAnswer,
} from '@employ-me/core';
import { guarded, isoNow, type DataResult, type StoreContext } from './context';
import { dataError, issuesFrom } from './errors';
import { inTransaction, readValues, requestValue, STORES } from './idb';
import {
  sortSavedAnswerRecords,
  type RefusedSavedAnswer,
  type SavedAnswerRecords,
} from './saved-answer-records';

export interface NewSavedAnswer {
  readonly question: string;
  readonly answer: string;
  readonly employerOverrides?: Readonly<Record<string, string>>;
}

export type SavedAnswerChanges = Partial<NewSavedAnswer>;

/**
 * A Draft you accepted for a field on an Application Form. `fieldType` is
 * what the Fill classified the field as, and must be ordinary: a Self-ID or
 * Attestation field can never become a Saved Answer (design.md "Sensitive
 * questions").
 */
export interface AcceptedDraft {
  readonly question: string;
  readonly answer: string;
  readonly fieldType: OrdinaryFieldType;
  /** The employer whose form it was. Picks the per-company override. */
  readonly employer?: EmployerKey;
}

/** The Saved Answers a Fill may use. Refused ones are left out (see listRefusedSavedAnswers). */
export function listSavedAnswers(ctx: StoreContext): Promise<DataResult<SavedAnswer[]>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.savedAnswers], 'readonly', async (t) => {
      const all = await readAll(t);
      return all.ok ? ok(all.value.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) : all;
    }),
  );
}

/** Saved Answers stored before employ-me refused their kind of question: shown only so you can delete them. */
export function listRefusedSavedAnswers(ctx: StoreContext): Promise<DataResult<RefusedSavedAnswer[]>> {
  return guarded(() =>
    inTransaction(ctx.db, [STORES.savedAnswers], 'readonly', async (t) => {
      const records = await readRecords(t);
      return records.ok
        ? ok(records.value.refused.sort((a, b) => a.question.localeCompare(b.question)))
        : records;
    }),
  );
}

/** A Saved Answer you type in yourself. Questions are unique, compared the way a Fill matches them. */
export function addSavedAnswer(ctx: StoreContext, input: NewSavedAnswer): Promise<DataResult<SavedAnswer>> {
  const now = isoNow(ctx);
  return write(ctx, null, () => ({
    id: ctx.newId(),
    question: input.question.trim(),
    answer: input.answer,
    employerOverrides: overrides(input.employerOverrides ?? {}),
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  }));
}

export function updateSavedAnswer(
  ctx: StoreContext,
  id: string,
  changes: SavedAnswerChanges,
): Promise<DataResult<SavedAnswer>> {
  return write(ctx, id, (current) =>
    current === undefined
      ? null
      : {
          ...current,
          ...(changes.question === undefined ? {} : { question: changes.question.trim() }),
          ...(changes.answer === undefined ? {} : { answer: changes.answer }),
          ...(changes.employerOverrides === undefined
            ? {}
            : { employerOverrides: overrides(changes.employerOverrides) }),
          updatedAt: isoNow(ctx),
        },
  );
}

/**
 * Keeps an accepted Draft. A new question becomes a Saved Answer. For a
 * question you already have, an answer given on one employer's form becomes
 * that employer's override; without an employer it replaces the answer.
 */
export function saveAcceptedDraft(ctx: StoreContext, draft: AcceptedDraft): Promise<DataResult<SavedAnswer>> {
  return guarded(async () => {
    const result = await inTransaction(ctx.db, [STORES.savedAnswers], 'readwrite', async (t) => {
      const all = await readAll(t);
      if (!all.ok) return all;
      const now = isoNow(ctx);
      const existing = all.value.find((saved) => labelsMatch(saved.question, draft.question));
      const next = existing === undefined ? fromDraft(ctx, draft, now) : withDraft(existing, draft, now);
      const parsed = savedAnswerSchema.safeParse(next);
      if (!parsed.success) {
        return dataError('invalidInput', 'The Saved Answer is invalid', issuesFrom(parsed.error));
      }
      await requestValue(t.objectStore(STORES.savedAnswers).put(parsed.data));
      return ok(parsed.data);
    });
    if (result.ok) ctx.notify(['savedAnswers']);
    return result;
  });
}

export function deleteSavedAnswer(ctx: StoreContext, id: string): Promise<DataResult<null>> {
  return guarded(async () => {
    const found = await inTransaction(ctx.db, [STORES.savedAnswers], 'readwrite', async (t) => {
      const store = t.objectStore(STORES.savedAnswers);
      const key = await requestValue(store.getKey(id));
      if (key === undefined) return false;
      await requestValue(store.delete(id));
      return true;
    });
    if (!found) return dataError('notFound', 'That Saved Answer no longer exists');
    ctx.notify(['savedAnswers']);
    return ok(null);
  });
}

function fromDraft(ctx: StoreContext, draft: AcceptedDraft, now: string): SavedAnswer {
  return {
    id: ctx.newId(),
    question: draft.question.trim(),
    answer: draft.answer,
    employerOverrides: {},
    source: 'draft',
    fieldType: draft.fieldType,
    createdAt: now,
    updatedAt: now,
  };
}

function withDraft(existing: SavedAnswer, draft: AcceptedDraft, now: string): SavedAnswer {
  if (draft.employer === undefined) return { ...existing, answer: draft.answer, updatedAt: now };
  const employer = draft.employer.toLowerCase();
  const { [employer]: _previous, ...others } = existing.employerOverrides;
  const employerOverrides =
    draft.answer === existing.answer ? others : { ...others, [employer]: draft.answer };
  return { ...existing, employerOverrides, updatedAt: now };
}

/** Writes one Saved Answer built from the current one (null for a new one), keeping questions unique. */
function write(
  ctx: StoreContext,
  id: string | null,
  build: (current: SavedAnswer | undefined) => SavedAnswer | null,
): Promise<DataResult<SavedAnswer>> {
  return guarded(async () => {
    const result = await inTransaction(ctx.db, [STORES.savedAnswers], 'readwrite', async (t) => {
      const all = await readAll(t);
      if (!all.ok) return all;
      const current = id === null ? undefined : all.value.find((saved) => saved.id === id);
      const next = build(current);
      if (next === null) return dataError('notFound', 'That Saved Answer no longer exists');
      const parsed = savedAnswerSchema.safeParse(next);
      if (!parsed.success) {
        return dataError('invalidInput', 'The Saved Answer is invalid', issuesFrom(parsed.error));
      }
      const duplicate = all.value.find(
        (saved) => saved.id !== parsed.data.id && labelsMatch(saved.question, parsed.data.question),
      );
      if (duplicate !== undefined) {
        return dataError('invalidInput', 'That question already has a Saved Answer', [
          { path: 'question', message: 'You already have a Saved Answer for this question' },
        ]);
      }
      await requestValue(t.objectStore(STORES.savedAnswers).put(parsed.data));
      return ok(parsed.data);
    });
    if (result.ok) ctx.notify(['savedAnswers']);
    return result;
  });
}

async function readAll(t: IDBTransaction): Promise<DataResult<SavedAnswer[]>> {
  const records = await readRecords(t);
  return records.ok ? ok(records.value.usable) : records;
}

async function readRecords(t: IDBTransaction): Promise<DataResult<SavedAnswerRecords>> {
  return sortSavedAnswerRecords(await readValues(t.objectStore(STORES.savedAnswers).getAll()));
}

/** Employer keys are lower-cased board slugs (core `employerKeySchema`). Blank entries are dropped. */
function overrides(input: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([employer, answer]) => [employer.trim().toLowerCase(), answer] as const)
      .filter(([employer]) => employer !== ''),
  );
}
