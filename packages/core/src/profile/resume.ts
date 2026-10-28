import { z } from 'zod';
import { idSchema, isoDateTimeSchema, nonEmptyText } from '../common';

export const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
] as const;

/** Metadata for one labelled Resume. The file's bytes are stored separately, keyed by `id`. */
export const resumeMetaSchema = z.strictObject({
  id: idSchema,
  /** Your label: "Backend", "New grad". */
  label: nonEmptyText.max(100),
  fileName: nonEmptyText.max(255),
  mimeType: z.enum(RESUME_MIME_TYPES),
  sizeBytes: z.int().positive(),
  addedAt: isoDateTimeSchema,
  isDefault: z.boolean(),
});
export type ResumeMeta = z.infer<typeof resumeMetaSchema>;

/** Labelled Resumes, exactly one marked default once there are any. */
export const resumesSchema = z
  .array(resumeMetaSchema)
  .refine((resumes) => resumes.length === 0 || resumes.filter((r) => r.isDefault).length === 1, {
    message: 'Exactly one Resume must be the default',
  });
