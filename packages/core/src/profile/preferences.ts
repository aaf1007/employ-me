import { z } from 'zod';
import { countryCodeSchema, currencyCodeSchema, isoDateSchema } from '../common';
import { VOCAB } from '../taxonomy/vocab';

export const salaryExpectationSchema = z
  .strictObject({
    /** The country's own currency (design.md "Preferences"). */
    currency: currencyCodeSchema,
    min: z.number().positive(),
    max: z.number().positive().optional(),
    period: z.enum(VOCAB.salaryPeriod),
  })
  .refine((s) => s.max === undefined || s.max >= s.min, {
    message: 'max must be at least min',
    path: ['max'],
  });
export type SalaryExpectation = z.infer<typeof salaryExpectationSchema>;

/** Preferences: relocation, work model, start date, notice period, salary per country. */
export const preferencesSchema = z.strictObject({
  relocation: z.boolean().optional(),
  workModels: z.array(z.enum(VOCAB.workModel)).default([]),
  startDate: isoDateSchema.optional(),
  noticePeriod: z.strictObject({ amount: z.int().nonnegative(), unit: z.enum(VOCAB.noticeUnit) }).optional(),
  salary: z.record(countryCodeSchema, salaryExpectationSchema).default({}),
});
export type Preferences = z.infer<typeof preferencesSchema>;
