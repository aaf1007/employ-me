import { z } from 'zod';
import { countryCodeSchema, nonEmptyText } from '../common';
import { VOCAB } from '../taxonomy/vocab';

// Shapes are exported separately so the resume-extract schema (provider
// output) can reuse them without `.strict()`. See provider/boundary.ts.

export const legalNameShape = {
  first: nonEmptyText,
  middle: z.string().trim().optional(),
  last: nonEmptyText,
};
export const legalNameSchema = z.strictObject(legalNameShape);

export const preferredNameShape = {
  first: z.string().trim().optional(),
  last: z.string().trim().optional(),
};
export const preferredNameSchema = z.strictObject(preferredNameShape);

/** Identity: legal and preferred name, 18 or older. */
export const identitySchema = z.strictObject({
  legalName: legalNameSchema,
  preferredName: preferredNameSchema.optional(),
  over18: z.boolean().optional(),
});
export type Identity = z.infer<typeof identitySchema>;

export const phoneShape = {
  /** "+1", "+44". */
  countryCode: z.string().regex(/^\+\d{1,3}$/, 'Use a country calling code such as +1'),
  /** National number, digits and common separators only. */
  number: z.string().regex(/^[0-9 ()-]{4,20}$/),
  type: z.enum(VOCAB.phoneType),
};
export const phoneSchema = z.strictObject(phoneShape);
export type Phone = z.infer<typeof phoneSchema>;

/** Contact: email; phone with country code and type. */
export const contactSchema = z.strictObject({
  email: z.email(),
  phone: phoneSchema.optional(),
});
export type Contact = z.infer<typeof contactSchema>;

export const addressShape = {
  line1: nonEmptyText,
  line2: z.string().trim().optional(),
  city: nonEmptyText,
  /** State, province or territory. */
  region: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  country: countryCodeSchema,
};
/** One address (design.md: multiple addresses come later). */
export const addressSchema = z.strictObject(addressShape);
export type Address = z.infer<typeof addressSchema>;

export const linksShape = {
  linkedin: z.url().optional(),
  github: z.url().optional(),
  portfolio: z.url().optional(),
};
export const linksSchema = z.strictObject(linksShape);
export type Links = z.infer<typeof linksSchema>;
