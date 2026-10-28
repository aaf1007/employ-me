import { VOCAB, err, ok, type ParseResumeOutput } from '@employ-me/core/protocol';
import { z } from 'zod';
import { UNTRUSTED_DATA_RULE, dataBlock, invalidOutput, jsonSchemaOf, type Prompt } from './prompt';
import { toResumeExtract } from './resume-extract';

// The Resume's text (extracted inside the helper, src/resume/) becomes a
// partial Profile for the user to review (design.md "Setup"). Work
// Authorization, Self-ID, screening and salary are not in the schema at all:
// those come from the questionnaire, never from inference.

const text = z.string().nullable();
const yearMonth = z.string().nullable().describe('YYYY-MM');

export const resumeWireSchema = z.object({
  legalName: z.object({ first: text, middle: text, last: text }),
  preferredName: z.object({ first: text, last: text }),
  email: text,
  phone: z.object({
    countryCode: text.describe('calling code such as +1'),
    number: text.describe('national number'),
    type: z.enum(VOCAB.phoneType).nullable(),
  }),
  address: z.object({
    line1: text,
    line2: text,
    city: text,
    region: text,
    postalCode: text,
    country: text.describe('ISO 3166-1 alpha-2, such as US or CA'),
  }),
  links: z.object({ linkedin: text, github: text, portfolio: text }),
  workHistory: z.array(
    z.object({
      employer: z.string(),
      title: z.string(),
      location: text,
      startDate: yearMonth,
      endDate: yearMonth,
      current: z.boolean(),
      description: text,
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: text.describe('as written, such as B.Sc.'),
      degreeLevel: z.enum(VOCAB.degreeLevel).nullable(),
      discipline: text,
      startDate: yearMonth,
      endDate: yearMonth,
      gpa: z.object({ value: z.number(), scale: z.number() }).nullable(),
    }),
  ),
  skills: z.array(z.string()),
  languages: z.array(z.object({ language: z.string(), proficiency: z.enum(VOCAB.languageProficiency) })),
});
export type ResumeWire = z.infer<typeof resumeWireSchema>;

export const PARSE_RESUME_SYSTEM = [
  "You copy facts from a resume into employ-me's Profile format, so the applicant can review them.",
  "Copy only what the resume states. Don't guess, infer or embellish. Use null, or an empty list, for anything it doesn't say.",
  'Never include work authorization, citizenship, visa status, salary, age, date of birth, gender, ethnicity or any other self-identification, even if the resume mentions them.',
  'Dates are YYYY-MM. If only a year is given, use month 01. A role that is ongoing ("Present") has current true and endDate null.',
  'Phone: countryCode is the calling code such as +1; number is the rest, digits and spaces only. Use type mobile unless the resume says otherwise.',
  'Links are full URLs starting with https:// (linkedin, github, and portfolio for a personal site).',
  'Work history description: the bullet points as written, one per line.',
  'Education: degree as written; degreeLevel only when the degree makes it clear; gpa only when both the value and the scale are given (3.8/4.0).',
  'Skills: short names, as written. Languages: spoken languages only, never programming languages, and only with a level the resume states.',
  UNTRUSTED_DATA_RULE,
].join('\n');

export function parseResumePrompt(resumeText: string): Prompt<ParseResumeOutput> {
  return {
    task: {
      type: 'parseResume',
      system: PARSE_RESUME_SYSTEM,
      prompt: `${dataBlock('resume', resumeText)}\n\nCopy the facts from <resume>.`,
      schema: jsonSchemaOf(resumeWireSchema),
      effort: 'default',
      timeoutMs: 150_000,
    },
    finish(raw) {
      const wire = resumeWireSchema.safeParse(raw);
      if (!wire.success) return err(invalidOutput('Resume extract'));
      const extract = toResumeExtract(wire.data);
      return extract === null ? err(invalidOutput('Resume extract')) : ok({ extract });
    },
  };
}
