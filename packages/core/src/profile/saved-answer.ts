import { z } from 'zod';
import { employerKeySchema, idSchema, isoDateTimeSchema, nonEmptyText } from '../common';

/**
 * An answer you accepted, reused when a later question matches word for word
 * (see labels/normalize.ts). Never created from a Self-ID or Attestation field.
 */
export const savedAnswerSchema = z.strictObject({
  id: idSchema,
  question: nonEmptyText.max(2000),
  answer: z.string().max(20_000),
  /** Overrides for a specific employer, keyed by employer key. */
  employerOverrides: z.record(employerKeySchema, z.string().max(20_000)).default({}),
  source: z.enum(['draft', 'manual', 'import']),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type SavedAnswer = z.infer<typeof savedAnswerSchema>;
