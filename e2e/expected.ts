import { fieldTypeSchema } from '@employ-me/core';
import { z } from 'zod';

// fixtures/<ats>/<name>.expected.json: what a Fill of that recorded form must
// produce from the test Profile. The fill specs check it; tools/fill-rate.ts
// counts it for the README coverage table.

export const expectedFieldSchema = z.strictObject({
  fieldId: z.string(),
  label: z.string(),
  fieldType: fieldTypeSchema,
  outcome: z.enum(['filled', 'needsReview', 'couldNotFill']),
  /** The fill source for filled fields, the reason otherwise. */
  reason: z.string(),
  /** What the form shows afterwards, read from the DOM by the test. */
  value: z.string(),
});
export type ExpectedField = z.infer<typeof expectedFieldSchema>;

export const expectedFileSchema = z.strictObject({
  fixture: z.string(),
  ats: z.enum(['greenhouse', 'lever', 'ashby', 'workday', 'generic']),
  /** Hand-built, never recorded (Workday's forms sit behind sign-in): unverified until a live pass. */
  synthetic: z.literal(true).optional(),
  posting: z.strictObject({
    title: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    country: z.string().optional(),
  }),
  fields: z.array(expectedFieldSchema),
});
export type ExpectedFile = z.infer<typeof expectedFileSchema>;
