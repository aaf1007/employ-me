import { z } from 'zod';
import { fieldTypeSchema } from '../taxonomy';

/**
 * Every field a Fill touches ends in exactly one of these three outcomes
 * (glossary "Fill"). There is no fourth "skipped" state: silence is the bug
 * users complain about most (research TL;DR).
 */
export const FILL_SOURCES = ['rules', 'savedAnswer', 'selfId', 'provider'] as const;

export const REVIEW_REASONS = [
  /** The AI found a similar, not identical, Saved Answer (design.md "Who fills what"). */
  'similarSavedAnswer',
  /** The Posting's country is unclear; each country's answer is shown side by side. */
  'countryUnclear',
  /** Sponsorship (or similar) is set to "Ask me each time". */
  'askEachTime',
  /** A Draft is waiting for you to accept, edit or reject it. */
  'draftReady',
  /** The AI matched this field; rules did not. */
  'providerMatched',
  /** More than one option matched equally well. */
  'ambiguousOption',
  /**
   * You changed this field on the page after a Fill, and a later re-plan
   * found an answer for it. Yours stays: a re-plan never writes over it.
   */
  'keptYourEdit',
  /**
   * Filled with what the Profile holds, but the question asks for more
   * ("list your countries of citizenship, and when you obtained them").
   */
  'asksForMore',
  /** The Resume was attached, but the form still showed it uploading when the Fill ended. */
  'fileUploading',
  /** The form shows a file other than the Resume you chose. */
  'otherFileShown',
] as const;

export const COULD_NOT_FILL_REASONS = [
  'notInProfile',
  'unrecognizedField',
  'noMatchingOption',
  'providerUnavailable',
  /** The Provider is available, but didn't write this one Draft. */
  'draftFailed',
  'valueDidNotStick',
  'controlNotSupported',
  /** Attestations are never ticked automatically. */
  'attestation',
  /** Passwords, SIN/SSN, date of birth, references. */
  'neverStored',
  /** Cover-letter fields are left empty and flagged. */
  'coverLetter',
  'fileRejected',
] as const;

export const fillSourceSchema = z.enum(FILL_SOURCES);
export const reviewReasonSchema = z.enum(REVIEW_REASONS);
export const couldNotFillReasonSchema = z.enum(COULD_NOT_FILL_REASONS);

export type FillSource = z.infer<typeof fillSourceSchema>;
export type ReviewReason = z.infer<typeof reviewReasonSchema>;
export type CouldNotFillReason = z.infer<typeof couldNotFillReasonSchema>;

export const fieldOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('filled'),
    fieldId: z.string(),
    fieldType: fieldTypeSchema,
    source: fillSourceSchema,
  }),
  z.strictObject({
    kind: z.literal('needsReview'),
    fieldId: z.string(),
    fieldType: fieldTypeSchema,
    reason: reviewReasonSchema,
  }),
  z.strictObject({
    kind: z.literal('couldNotFill'),
    fieldId: z.string(),
    fieldType: fieldTypeSchema,
    reason: couldNotFillReasonSchema,
    /** What the user can do about it, in plain words. Always present. */
    fix: z.string().min(1),
  }),
]);
export type FieldOutcome = z.infer<typeof fieldOutcomeSchema>;
