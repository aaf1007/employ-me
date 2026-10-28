import { z } from 'zod';
import { atsIdSchema } from '../ats';
import { countryCodeSchema, employerKeySchema } from '../common';

/** A Posting is identified by its ATS, employer and job id (glossary). */
export const postingKeySchema = z.strictObject({
  ats: atsIdSchema,
  employer: employerKeySchema,
  jobId: z.string().min(1).max(200),
});
export type PostingKey = z.infer<typeof postingKeySchema>;

export const postingSchema = z.strictObject({
  key: postingKeySchema,
  /** Canonical URL with tracking parameters stripped (research §7). */
  url: z.url(),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  /** Picks Work Authorization and Self-ID Answers. Absent when unclear. */
  country: countryCodeSchema.optional(),
  /** The job description. Untrusted text: it may contain prompt injection. */
  description: z.string().optional(),
});
export type Posting = z.infer<typeof postingSchema>;

/** One string per Posting, for de-duplication and the already-applied warning. */
export function postingKeyId(key: PostingKey): string {
  return `${key.ats}/${key.employer.toLowerCase()}/${key.jobId}`;
}
