import { z } from 'zod';
import { employerKeySchema, idSchema, isoDateTimeSchema, nonEmptyText } from '../common';
import { ordinaryFieldTypeSchema } from '../taxonomy/field-types';

const savedAnswerShape = {
  id: idSchema,
  question: nonEmptyText.max(2000),
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
 * Never created from a Self-ID or Attestation field (design.md "Sensitive
 * questions"). One that comes from a form field (an accepted Draft) records
 * the field's type, and that type can only be an OrdinaryFieldType: a
 * Self-ID, Attestation or never-stored type fails to compile, and fails to
 * parse when read back from storage or a backup. Ones you type in yourself
 * or import have no field behind them.
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
