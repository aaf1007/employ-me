import { z } from 'zod';
import { countryCodeSchema } from '../common';
import { VOCAB } from '../taxonomy/vocab';

/**
 * Work Authorization for ONE country (glossary). The Profile keeps one per
 * country you apply in, and the fill engine picks it by the Posting's country.
 */
export const workAuthorizationSchema = z.strictObject({
  citizenships: z.array(countryCodeSchema).default([]),
  /** Whether you're allowed to work in this country now. */
  authorizedNow: z.boolean(),
  /** Your status in your own words: "Citizen", "Permanent resident", "TN". */
  status: z.string().trim().max(200).optional(),
  /** Yes / No / Ask me each time. "ask" sends the question to review. */
  sponsorship: z.enum(VOCAB.sponsorship),
  explanation: z.string().max(2000).optional(),
  /** US only: export-control "U.S. person". */
  usPerson: z.boolean().optional(),
});
export type WorkAuthorization = z.infer<typeof workAuthorizationSchema>;

export const workAuthorizationByCountrySchema = z
  .record(countryCodeSchema, workAuthorizationSchema)
  .superRefine((byCountry, ctx) => {
    for (const [country, auth] of Object.entries(byCountry)) {
      if (country !== 'US' && auth.usPerson !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [country, 'usPerson'],
          message: '"U.S. person" applies to the US Work Authorization only',
        });
      }
    }
  });
export type WorkAuthorizationByCountry = z.infer<typeof workAuthorizationByCountrySchema>;
