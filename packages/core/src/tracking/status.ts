import { z } from 'zod';

/** Applied → Interviewing → Offer / Rejected / Withdrawn. Only the user changes it. */
export const STATUSES = ['applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const;
export const statusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof statusSchema>;

export const INITIAL_STATUS: Status = 'applied';
