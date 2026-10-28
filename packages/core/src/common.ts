import { z } from 'zod';

/** ISO 3166-1 alpha-2, upper case: "US", "CA". */
export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 country code, e.g. US or CA');
export type CountryCode = z.infer<typeof countryCodeSchema>;

/** ISO 4217, upper case: "USD", "CAD". */
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 currency code');

/** "2024-09". Work history and education use month precision. */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
export type YearMonth = z.infer<typeof yearMonthSchema>;

export const isoDateSchema = z.iso.date();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const idSchema = z.string().min(1).max(64);

export const nonEmptyText = z.string().trim().min(1);

/**
 * Employers are keyed by the ATS board/org slug ("acme" in
 * job-boards.greenhouse.io/acme/...), lower-cased.
 */
export const employerKeySchema = z.string().min(1).max(200);
export type EmployerKey = z.infer<typeof employerKeySchema>;
