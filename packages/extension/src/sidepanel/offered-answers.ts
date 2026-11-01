import {
  formAnswerSchema,
  labelsMatch,
  type FieldType,
  type FormAnswer,
  type SavedAnswer,
  type SubmittedAnswer,
} from '@employ-me/core';
import type { FieldView } from '../messaging/content';

/** One answer the side panel offers to keep, unticked until you tick it. */
export interface OfferedAnswer extends FormAnswer {
  readonly key: string;
  /** Set when the question already has a different Saved Answer: the answer this one replaces. */
  readonly previous?: string;
}

/**
 * What the side panel offers to keep once an Application is created
 * (design.md "Keeping answers you gave on the form"): each field that ended
 * Needs your review or Couldn't fill, or that you changed, with a single
 * answer left in the form (`answers`, what the form last showed). Fields your
 * Profile answers are left out, since a later Fill wouldn't use a Saved
 * Answer there, and core's formAnswerSchema drops everything else that is
 * never kept. A question with the same Saved Answer already is left out;
 * one with a different answer carries the answer it replaces.
 */
export function offeredAnswers(
  fields: readonly FieldView[],
  answers: readonly SubmittedAnswer[],
  saved: readonly SavedAnswer[],
  employer: string | null,
): OfferedAnswer[] {
  const shown = new Map(answers.map((a) => [answerKey(a.label, a.fieldType), a.value]));
  const offered: OfferedAnswer[] = [];
  for (const field of fields) {
    if (!yoursToKeep(field)) continue;
    const answer = singleAnswer(shown.get(answerKey(field.label, field.fieldType)));
    if (answer === null) continue;
    const parsed = formAnswerSchema.safeParse({ question: field.label, answer, fieldType: field.fieldType });
    if (!parsed.success) continue;
    const existing = saved.find((s) => labelsMatch(s.question, parsed.data.question));
    const previous =
      existing === undefined
        ? undefined
        : ((employer === null ? undefined : existing.employerOverrides[employer]) ?? existing.answer);
    if (previous?.trim() === parsed.data.answer) continue;
    const item: OfferedAnswer = {
      key: answerKey(parsed.data.question, parsed.data.fieldType),
      ...parsed.data,
      ...(previous === undefined ? {} : { previous }),
    };
    // A question asked again on a later step: its later answer.
    const earlier = offered.findIndex((o) => labelsMatch(o.question, item.question));
    if (earlier !== -1) offered.splice(earlier, 1);
    offered.push(item);
  }
  return offered;
}

/** The key the Snapshot's answers are merged by. */
function answerKey(label: string, fieldType: FieldType): string {
  return `${fieldType}|${label}`;
}

/**
 * The Fill didn't fill it, or you changed it, and a later Fill would use a
 * Saved Answer for it: a question only you answer, or one your Profile has
 * no answer for (design.md "Who fills what").
 */
function yoursToKeep({ outcome, userEdited, fieldType }: FieldView): boolean {
  if (outcome?.kind === 'filled' && !userEdited) return false;
  if (outcome === null && !userEdited) return false;
  if (fieldType === 'unknown' || fieldType === 'freeText.question') return true;
  if (outcome?.kind === 'couldNotFill')
    return outcome.reason === 'notInProfile' || outcome.reason === 'unrecognizedField';
  return outcome?.kind === 'filled' && outcome.source === 'savedAnswer';
}

/** One answer's text: a Saved Answer is one text, so several ticked options or a lone checkbox aren't kept. */
function singleAnswer(value: SubmittedAnswer['value'] | undefined): string | null {
  const text =
    typeof value === 'string' ? value : Array.isArray(value) && value.length === 1 ? value[0] : null;
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
