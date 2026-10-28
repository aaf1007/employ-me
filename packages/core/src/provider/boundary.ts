import { z } from 'zod';
import { atsIdSchema } from '../ats';
import { idSchema, type EmployerKey } from '../common';
import { fieldDescriptorSchema, type FieldDescriptor } from '../fields/descriptor';
import {
  educationEntryShape,
  educationEntrySchema,
  languageSkillShape,
  languageSkillSchema,
  skillShape,
  skillSchema,
  workEntryShape,
  workEntrySchema,
  type Background,
} from '../profile/background';
import {
  addressShape,
  legalNameShape,
  linksSchema,
  linksShape,
  phoneShape,
  preferredNameShape,
  type Identity,
  type Links,
} from '../profile/identity';
import { RESUME_MIME_TYPES } from '../profile/resume';
import type { SavedAnswer } from '../profile/saved-answer';
import { err, ok, type Result } from '../result';
import { fieldTypeSchema, mayGoToProvider, type FieldType } from '../taxonomy';

// The Provider boundary (design.md "AI" and "Sensitive questions").
//
// Everything a Provider can receive is defined here, and nowhere else:
//  - Inputs are strict (unknown keys are rejected, not stripped) and branded,
//    so the only way to build one is through the `to*` functions below, which
//    pick whitelisted fields explicitly. The helper re-validates every input.
//  - Field mapping carries labels and options only, never a Profile value and
//    never a field's current value.
//  - Fields the rules classified as Self-ID, Attestation or never-stored are
//    refused.
//  - Draft context is an explicit whitelist of Profile facts.
//  - Outputs from a Provider are parsed leniently (unknown keys stripped) and
//    treated strictly as data.
//
// This module must not import profile/self-id, profile/profile, profile/index
// or tracking/*. ESLint enforces that.

export type BoundaryRefusal =
  | { readonly reason: 'sensitiveField'; readonly fieldId: string; readonly fieldType: FieldType }
  | { readonly reason: 'invalid'; readonly message: string };

// ---------------------------------------------------------------- inputs

export const providerFieldSchema = fieldDescriptorSchema.brand<'ProviderField'>();
export type ProviderField = z.infer<typeof providerFieldSchema>;

/**
 * The only way to put a field in a mapFields request. `ruleType` is what the
 * built-in rules classified it as ("unknown" when they didn't recognize it).
 */
export function toProviderField(
  field: FieldDescriptor,
  ruleType: FieldType,
): Result<ProviderField, BoundaryRefusal> {
  if (!mayGoToProvider(ruleType)) {
    return err({ reason: 'sensitiveField', fieldId: field.fieldId, fieldType: ruleType });
  }
  // Pick explicitly: `field` may be a richer runtime object (e.g. fill's
  // ExtractedField with an element reference) that must not leak through.
  const picked: FieldDescriptor = {
    fieldId: field.fieldId,
    label: field.label,
    control: field.control,
    options: field.options,
    required: field.required,
    ...(field.section === undefined ? {} : { section: field.section }),
    ...(field.description === undefined ? {} : { description: field.description }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  };
  return parseInput(providerFieldSchema, picked);
}

/** Saved Answers go to field mapping as questions only, never answers. */
export const providerSavedQuestionSchema = z
  .strictObject({ id: idSchema, question: z.string().max(2000) })
  .brand<'ProviderSavedQuestion'>();
export type ProviderSavedQuestion = z.infer<typeof providerSavedQuestionSchema>;

export function toProviderSavedQuestion(
  saved: Pick<SavedAnswer, 'id' | 'question'>,
): Result<ProviderSavedQuestion, BoundaryRefusal> {
  return parseInput(providerSavedQuestionSchema, { id: saved.id, question: saved.question });
}

export const mapFieldsInputSchema = z.strictObject({
  ats: atsIdSchema,
  fields: z.array(providerFieldSchema).min(1).max(500),
  savedQuestions: z.array(providerSavedQuestionSchema).max(5000),
});
export type MapFieldsInput = z.infer<typeof mapFieldsInputSchema>;

/** The Profile facts a Draft may use. Nothing else from the Profile is sent. */
export const draftFactsSchema = z.strictObject({
  /** Preferred name if set, else legal name. */
  name: z.string().optional(),
  links: linksSchema.optional(),
  workHistory: z.array(workEntrySchema),
  education: z.array(educationEntrySchema),
  skills: z.array(skillSchema),
  languages: z.array(languageSkillSchema),
});
export type DraftFacts = z.infer<typeof draftFactsSchema>;

export const draftQuestionSchema = z.strictObject({
  label: z.string().min(1).max(2000),
  description: z.string().max(4000).optional(),
  maxLength: z.int().positive().optional(),
  required: z.boolean(),
  /** BCP 47 tag of the question's language; the Draft is written in it. */
  language: z.string().min(2).max(35).optional(),
});
export type DraftQuestion = z.infer<typeof draftQuestionSchema>;

export const draftPostingSchema = z.strictObject({
  title: z.string().optional(),
  company: z.string().optional(),
  /** Untrusted text. Providers run with every tool turned off. */
  description: z.string().max(100_000).optional(),
});
export type DraftPosting = z.infer<typeof draftPostingSchema>;

export const DRAFT_MODES = ['write', 'polish'] as const;

export const draftContextSchema = z
  .strictObject({
    question: draftQuestionSchema,
    /** "polish" when the form has an AI-use policy question (design.md "Drafts"). */
    mode: z.enum(DRAFT_MODES),
    /** Your own first draft. Required in polish mode. */
    userDraft: z.string().max(20_000).optional(),
    posting: draftPostingSchema,
    facts: draftFactsSchema,
    savedAnswers: z
      .array(z.strictObject({ question: z.string().max(2000), answer: z.string().max(20_000) }))
      .max(500),
  })
  .refine((c) => c.mode === 'write' || (c.userDraft ?? '').trim() !== '', {
    message: 'polish mode needs your own draft',
    path: ['userDraft'],
  })
  .brand<'DraftContext'>();
export type DraftContext = z.infer<typeof draftContextSchema>;

/** The parts of a Profile that toDraftContext reads. A full Profile satisfies it. */
export interface DraftSource {
  readonly identity?: Identity | undefined;
  readonly links: Links;
  readonly background: Background;
  readonly savedAnswers: readonly SavedAnswer[];
}

export interface DraftRequest {
  readonly question: DraftQuestion;
  readonly mode: (typeof DRAFT_MODES)[number];
  readonly userDraft?: string;
  readonly posting: DraftPosting;
  /** Picks employer-specific Saved Answer overrides. */
  readonly employer?: EmployerKey;
}

/** The only way to build a Draft context. Copies whitelisted facts field by field. */
export function toDraftContext(
  source: DraftSource,
  request: DraftRequest,
): Result<DraftContext, BoundaryRefusal> {
  const { identity, background } = source;
  const first = identity?.preferredName?.first ?? identity?.legalName.first;
  const last = identity?.preferredName?.last ?? identity?.legalName.last;
  const name = [first, last].filter((part) => part !== undefined && part !== '').join(' ');
  const employer = request.employer;

  return parseInput(draftContextSchema, {
    question: request.question,
    mode: request.mode,
    ...(request.userDraft === undefined ? {} : { userDraft: request.userDraft }),
    posting: request.posting,
    facts: {
      ...(name === '' ? {} : { name }),
      links: { ...source.links },
      workHistory: background.workHistory,
      education: background.education,
      skills: background.skills,
      languages: background.languages,
    },
    savedAnswers: source.savedAnswers.map((saved) => ({
      question: saved.question,
      answer: (employer === undefined ? undefined : saved.employerOverrides[employer]) ?? saved.answer,
    })),
  });
}

export const parseResumeInputSchema = z.strictObject({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(RESUME_MIME_TYPES),
  /** The file itself. The Provider reads it once to pre-fill the Profile (design.md "Setup"). */
  dataBase64: z.base64().max(20 * 1024 * 1024),
});
export type ParseResumeInput = z.infer<typeof parseResumeInputSchema>;

// --------------------------------------------------------------- outputs

export const fieldMatchSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fieldType'),
    fieldType: fieldTypeSchema,
    /** The form's option text mapped to canonical vocab values (taxonomy/vocab.ts). */
    options: z.array(z.object({ option: z.string(), value: z.string() })).default([]),
  }),
  /** A similar Saved Answer. Always goes to review, never fills directly. */
  z.object({ kind: z.literal('savedAnswer'), savedAnswerId: idSchema }),
  z.object({ kind: z.literal('needsDraft') }),
  z.object({ kind: z.literal('unknown') }),
]);
export type FieldMatch = z.infer<typeof fieldMatchSchema>;

export const mapFieldsOutputSchema = z.object({
  mappings: z.array(
    z.object({
      fieldId: z.string(),
      match: fieldMatchSchema,
      /** How sure the Provider is, 0 to 1. The fill engine can send low-confidence matches to review. */
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type MapFieldsOutput = z.infer<typeof mapFieldsOutputSchema>;

/** Where a claim in a Draft came from. `userDraft` is your own text, in polish mode. */
export const CLAIM_SUPPORT = ['profile', 'savedAnswer', 'posting', 'userDraft', 'unsupported'] as const;

export const draftSchema = z.object({
  text: z.string(),
  language: z.string(),
  /** Each claim and where it came from. "unsupported" claims are flagged to the user. */
  claims: z.array(z.object({ text: z.string(), support: z.enum(CLAIM_SUPPORT) })),
});
export type Draft = z.infer<typeof draftSchema>;

export const draftAnswerOutputSchema = z.object({ draft: draftSchema });
export type DraftAnswerOutput = z.infer<typeof draftAnswerOutputSchema>;

/**
 * What a Provider may extract from a Resume. Deliberately has no Work
 * Authorization, Self-ID, screening or salary: those come from the
 * questionnaire, never from inference.
 */
export const resumeExtractSchema = z.object({
  identity: z
    .object({
      legalName: z.object(legalNameShape).partial().optional(),
      preferredName: z.object(preferredNameShape).optional(),
    })
    .optional(),
  contact: z
    .object({ email: z.email().optional(), phone: z.object(phoneShape).partial().optional() })
    .optional(),
  address: z.object(addressShape).partial().optional(),
  links: z.object(linksShape).optional(),
  background: z
    .object({
      workHistory: z.array(z.object(workEntryShape)).default([]),
      education: z.array(z.object(educationEntryShape)).default([]),
      skills: z.array(z.object(skillShape)).default([]),
      languages: z.array(z.object(languageSkillShape)).default([]),
    })
    .optional(),
});
export type ResumeExtract = z.infer<typeof resumeExtractSchema>;

export const parseResumeOutputSchema = z.object({ extract: resumeExtractSchema });
export type ParseResumeOutput = z.infer<typeof parseResumeOutputSchema>;

// --------------------------------------------------------------- helpers

function parseInput<S extends z.ZodType>(schema: S, value: unknown): Result<z.infer<S>, BoundaryRefusal> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err({ reason: 'invalid', message: z.prettifyError(parsed.error) });
}
