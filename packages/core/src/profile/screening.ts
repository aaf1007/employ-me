import { z } from 'zod';
import { employerKeySchema } from '../common';

/**
 * Common screening answers. Facts and willingness questions are filled from
 * here; they are not Attestations (glossary "Attestation").
 */
export const screeningSchema = z.strictObject({
  howHeard: z.string().trim().max(200).optional(),
  referred: z.boolean().optional(),
  /** Remembered per company. A company missing here is asked, not guessed. */
  workedHereBefore: z.record(employerKeySchema, z.boolean()).default({}),
  /** Willing to do a background check. */
  backgroundCheck: z.boolean().optional(),
  /** Bound by a non-compete. */
  nonCompete: z.boolean().optional(),
});
export type Screening = z.infer<typeof screeningSchema>;
