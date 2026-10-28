import { z } from 'zod';
import { employerKeySchema, idSchema, isoDateTimeSchema, nonEmptyText } from '../common';
import { ordinaryFieldTypeSchema } from '../taxonomy/field-types';
import { sensitiveQuestion } from '../taxonomy/sensitive';

export const SENSITIVE_QUESTION_MESSAGE =
  'employ-me never keeps answers to Self-ID questions, Attestations, or questions about passwords, SIN/SSN, date of birth or references. Answer it on the form yourself.';

/**
 * A Saved Answer's question. Self-ID, Attestation and never-stored questions
 * are refused by the same rules the Fill classifies fields with, however the
 * Saved Answer was made: typed in, imported, restored from a backup, or read
 * back from storage (design.md "Sensitive questions").
 */
export const savedQuestionSchema = nonEmptyText
  .max(2000)
  .refine((question) => sensitiveQuestion(question) === null, SENSITIVE_QUESTION_MESSAGE);

const savedAnswerShape = {
  id: idSchema,
  question: savedQuestionSchema,
  answer: z.string().max(20_000),
  /** Overrides for a specific employer, keyed by employer key. */
  employerOverrides: z.record(employerKeySchema, z.string().max(20_000)).default({}),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
};

/**
 * An answer you accepted, reused when a later question matches word for word
 * (see labels/normalize.ts).
 *
 * Never created from a Self-ID or Attestation field, and never holds a
 * question that reads like one (design.md "Sensitive questions"). One that
 * comes from a form field (an accepted Draft) records the field's type, and
 * that type can only be an OrdinaryFieldType: a Self-ID, Attestation or
 * never-stored type fails to compile, and fails to parse when read back from
 * storage or a backup. Ones you type in yourself or import have no field
 * behind them.
 */
export const savedAnswerSchema = z.discriminatedUnion('source', [
  z.strictObject({
    ...savedAnswerShape,
    source: z.literal('draft'),
    fieldType: ordinaryFieldTypeSchema,
  }),
  z.strictObject({ ...savedAnswerShape, source: z.enum(['manual', 'import']) }),
]);
export type SavedAnswer = z.infer<typeof savedAnswerSchema>;
export type SavedAnswerSource = SavedAnswer['source'];
