import { z } from 'zod';
import { countryCodeSchema } from '../common';
import { backgroundSchema } from './background';
import { addressSchema, contactSchema, identitySchema, linksSchema } from './identity';
import { preferencesSchema } from './preferences';
import { resumesSchema } from './resume';
import { savedAnswerSchema } from './saved-answer';
import { screeningSchema } from './screening';
import { selfIdAnswersSchema } from './self-id';
import { workAuthorizationByCountrySchema } from './work-authorization';

export const PROFILE_SCHEMA_VERSION = 1;

/**
 * The Profile, exactly as design.md "What the Profile holds" lists it.
 *
 * Every object is strict, so anything design.md says is "never stored"
 * (SIN/SSN, passwords, references, signatures, date of birth) is rejected
 * rather than silently kept. Sections are optional or defaulted so a Profile
 * can be saved part-way through setup; the fill engine reports missing values
 * as "Couldn't fill: not in your Profile".
 */
export const profileSchema = z.strictObject({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  identity: identitySchema.optional(),
  contact: contactSchema.optional(),
  address: addressSchema.optional(),
  links: linksSchema.prefault({}),
  /** Countries you apply in, from the setup questionnaire. */
  countries: z.array(countryCodeSchema).default([]),
  workAuthorization: workAuthorizationByCountrySchema.default({}),
  preferences: preferencesSchema.prefault({}),
  background: backgroundSchema.prefault({}),
  resumes: resumesSchema.default([]),
  selfId: selfIdAnswersSchema.prefault({}),
  screening: screeningSchema.prefault({}),
  savedAnswers: z.array(savedAnswerSchema).default([]),
});
export type Profile = z.infer<typeof profileSchema>;
export type ProfileInput = z.input<typeof profileSchema>;

export function emptyProfile(): Profile {
  return profileSchema.parse({ schemaVersion: PROFILE_SCHEMA_VERSION });
}
