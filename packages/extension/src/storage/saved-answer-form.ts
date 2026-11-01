import {
  labelsMatch,
  ok,
  savedAnswerSchema,
  type EmployerKey,
  type FormAnswer,
  type SavedAnswer,
} from '@employ-me/core';
import { guarded, isoNow, type DataResult, type StoreContext } from './context';
import { dataError, issuesFrom } from './errors';
import { inTransaction, requestValue, STORES } from './idb';
import { readAll } from './saved-answer-store';

/** The answers you ticked in the side panel's offer, from one Application Form. */
export interface FormAnswers {
  readonly answers: readonly FormAnswer[];
  /** The employer whose form it was: an override of theirs is what an update changes. */
  readonly employer?: EmployerKey;
}

/**
 * Keeps answers you gave on a form (design.md "Keeping answers you gave on
 * the form"), all or none. A new question becomes a Saved Answer from a
 * form. For a question you already have, the employer's own override
 * changes when it has one, and otherwise the answer.
 */
export function saveFormAnswers(ctx: StoreContext, input: FormAnswers): Promise<DataResult<SavedAnswer[]>> {
  return guarded(async () => {
    const result = await inTransaction(ctx.db, [STORES.savedAnswers], 'readwrite', async (t) => {
      const all = await readAll(t);
      if (!all.ok) return all;
      const now = isoNow(ctx);
      const employer = input.employer?.toLowerCase();
      const next: SavedAnswer[] = [];
      for (const answer of input.answers) {
        const existing = [...all.value, ...next].find((saved) =>
          labelsMatch(saved.question, answer.question),
        );
        const built =
          existing === undefined
            ? fromForm(ctx, answer, now)
            : updated(existing, answer.answer, employer, now);
        const parsed = savedAnswerSchema.safeParse(built);
        if (!parsed.success) {
          return dataError('invalidInput', 'The Saved Answer is invalid', issuesFrom(parsed.error));
        }
        const at = next.findIndex((saved) => saved.id === parsed.data.id);
        if (at === -1) next.push(parsed.data);
        else next[at] = parsed.data;
      }
      const store = t.objectStore(STORES.savedAnswers);
      for (const saved of next) await requestValue(store.put(saved));
      return ok(next);
    });
    if (result.ok) ctx.notify(['savedAnswers']);
    return result;
  });
}

function fromForm(ctx: StoreContext, answer: FormAnswer, now: string): SavedAnswer {
  return {
    id: ctx.newId(),
    question: answer.question.trim(),
    answer: answer.answer,
    employerOverrides: {},
    source: 'form',
    fieldType: answer.fieldType,
    createdAt: now,
    updatedAt: now,
  };
}

function updated(
  existing: SavedAnswer,
  answer: string,
  employer: string | undefined,
  now: string,
): SavedAnswer {
  const override = employer !== undefined && employer in existing.employerOverrides;
  return override
    ? {
        ...existing,
        employerOverrides: { ...existing.employerOverrides, [employer]: answer },
        updatedAt: now,
      }
    : { ...existing, answer, updatedAt: now };
}
