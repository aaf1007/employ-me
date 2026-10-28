import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from '../common';
import { postingSchema } from './posting';
import { snapshotSchema } from './snapshot';
import { statusSchema } from './status';

/**
 * How an Application came to exist. These are the only ways (design.md
 * "Tracking"): a form you abandon is never an Application.
 */
export const APPLICATION_SOURCES = ['confirmation', 'didYouApply', 'manual', 'import'] as const;
export const applicationSourceSchema = z.enum(APPLICATION_SOURCES);

export const applicationSchema = z.strictObject({
  id: idSchema,
  posting: postingSchema,
  appliedAt: isoDateTimeSchema,
  source: applicationSourceSchema,
  status: statusSchema,
  notes: z.string().default(''),
  /** Absent for Applications added by hand or imported from CSV. */
  snapshot: snapshotSchema.optional(),
});
export type Application = z.infer<typeof applicationSchema>;
