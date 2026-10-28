import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from '../common';
import { fieldTypeSchema } from '../taxonomy';

export const submittedAnswerSchema = z.strictObject({
  /** The question as the form showed it. */
  label: z.string(),
  fieldType: fieldTypeSchema,
  value: z.union([z.string(), z.array(z.string()), z.boolean()]),
});
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;

/** A copy of the Resume's metadata, kept even if the Resume is later deleted. */
export const resumeRefSchema = z.strictObject({
  id: idSchema,
  label: z.string(),
  fileName: z.string(),
});

/**
 * What you sent: the Posting's description, the answers you submitted and the
 * Resume you used (glossary "Snapshot"). Stays in the browser. It can contain
 * Self-ID Answers, so it never goes to a Provider.
 */
export const snapshotSchema = z.strictObject({
  capturedAt: isoDateTimeSchema,
  postingDescription: z.string(),
  answers: z.array(submittedAnswerSchema),
  resume: resumeRefSchema.nullable(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
