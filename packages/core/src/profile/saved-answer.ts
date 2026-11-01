import { z } from 'zod';
import { employerKeySchema, idSchema, isoDateTimeSchema, nonEmptyText } from '../common';
import { ordinaryFieldTypeSchema, type OrdinaryFieldType } from '../taxonomy/field-types';
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

/**
 * Field types whose answer depends on the Posting: your Profile keeps them per
 * country or per company, and a Saved Answer from one Posting would guess at
 * another (design.md "Country-specific answers"; core screening.ts: a company
 * missing is asked, not guessed).
 */
export const PER_POSTING_FIELD_TYPES = [
  'workAuth.authorized',
  'workAuth.sponsorship',
  'workAuth.status',
  'workAuth.citizenship',
  'workAuth.explanation',
  'workAuth.usPerson',
  'pref.salary',
  'screening.workedHereBefore',
] as const satisfies readonly OrdinaryFieldType[];

/**
 * Your work history and education. Forms ask them once per job or school
 * under the same labels ("Role Description", "School"), so one Saved Answer
 * would fill every entry alike: they're the Profile's to keep.
 */
export const HISTORY_FIELD_TYPES = [
  'work.currentEmployer',
  'work.currentTitle',
  'work.employer',
  'work.title',
  'work.location',
  'work.startDate',
  'work.endDate',
  'work.current',
  'work.description',
  'edu.school',
  'edu.degree',
  'edu.discipline',
  'edu.startDate',
  'edu.endDate',
  'edu.gpa',
] as const satisfies readonly OrdinaryFieldType[];

/**
 * Ordinary field types an answer you gave on a form is never kept for: the
 * per-Posting and history ones, files and Resumes, and cover letters, which
 * are written for one Posting (design.md "Keeping answers you gave on the
 * form"). A Fill never answers these from a Saved Answer either.
 */
const NOT_KEPT_FROM_A_FORM = [
  ...PER_POSTING_FIELD_TYPES,
  ...HISTORY_FIELD_TYPES,
  'file.resume',
  'file.coverLetter',
  'freeText.coverLetter',
] as const;

/** The field types an answer you gave on an Application Form may be kept for. */
export const formAnswerFieldTypeSchema = ordinaryFieldTypeSchema.exclude(NOT_KEPT_FROM_A_FORM);
export type FormAnswerFieldType = z.infer<typeof formAnswerFieldTypeSchema>;

/**
 * An answer you left in an Application Form, which the side panel offers to
 * keep as a Saved Answer once the Application is created. Whatever this
 * refuses is never offered: Self-ID, Attestation and never-stored fields or
 * questions, per-Posting and history fields, files and cover letters, and empty
 * answers.
 */
export const formAnswerSchema = z.strictObject({
  question: savedQuestionSchema,
  answer: nonEmptyText.max(20_000),
  fieldType: formAnswerFieldTypeSchema,
});
export type FormAnswer = z.infer<typeof formAnswerSchema>;

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
 * comes from an accepted Draft records the field's type, and
 * that type can only be an OrdinaryFieldType: a Self-ID, Attestation or
 * never-stored type fails to compile, and fails to parse when read back from
 * storage or a backup. One kept from an answer you gave on a form records
 * the field's type the same way, narrowed by formAnswerFieldTypeSchema.
 * Ones you type in yourself or import have no field behind them.
 */
export const savedAnswerSchema = z.discriminatedUnion('source', [
  z.strictObject({
    ...savedAnswerShape,
    source: z.literal('draft'),
    fieldType: ordinaryFieldTypeSchema,
  }),
  z.strictObject({
    ...savedAnswerShape,
    source: z.literal('form'),
    fieldType: formAnswerFieldTypeSchema,
  }),
  z.strictObject({ ...savedAnswerShape, source: z.enum(['manual', 'import']) }),
]);
export type SavedAnswer = z.infer<typeof savedAnswerSchema>;
export type SavedAnswerSource = SavedAnswer['source'];
