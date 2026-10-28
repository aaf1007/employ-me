import {
  atsIdSchema,
  controlKindSchema,
  countryCodeSchema,
  draftPostingSchema,
  draftQuestionSchema,
  employerKeySchema,
  fieldMatchSchema,
  fieldOutcomeSchema,
  fieldTypeSchema,
  idSchema,
  mapFieldsInputSchema,
  ordinaryFieldTypeSchema,
  postingSchema,
  resumeRefSchema,
  submittedAnswerSchema,
} from '@employ-me/core';
import { z } from 'zod';

// Messages between the side panel and the ATS content script. The panel
// sends requests with tabs.sendMessage (every frame gets them; only the frame
// holding the Application Form answers) and opens a session port for the
// Fill, on which the content script reports what happens on the page. Both
// ends parse everything: anything can call runtime.sendMessage on a page the
// content script runs in.

/** Facts from the Posting's public job API (fill's PublicPostingDetails). */
export const publicPostingDetailsSchema = z.strictObject({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  country: countryCodeSchema.optional(),
  description: z.string().max(200_000).optional(),
  fieldOptions: z.record(z.string(), z.array(z.string()).readonly()).readonly().optional(),
});

/** What the side panel learnt from the Provider and from you, fed back into the Fill (fill's ProviderFeedback). */
export const providerFeedbackSchema = z.strictObject({
  state: z.enum(['pending', 'unavailable', 'answered']).optional(),
  unavailableFix: z.string().optional(),
  mappings: z
    .array(
      z.strictObject({ fieldId: z.string(), match: fieldMatchSchema, confidence: z.number().min(0).max(1) }),
    )
    .optional(),
  draftsReady: z.array(z.string()).optional(),
  accepted: z.array(z.strictObject({ fieldId: z.string(), text: z.string().max(20_000) })).optional(),
});
export type ProviderFeedbackMessage = z.infer<typeof providerFeedbackSchema>;

export const contentRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ping') }),
  /** Is there an Application Form (or the ATS's confirmation) in this frame? */
  z.strictObject({ type: z.literal('detect') }),
  /** Start a Fill, or Fill again: a re-plan never writes over what you changed on the page. */
  z.strictObject({
    type: z.literal('fill'),
    resumeId: idSchema.optional(),
    posting: postingSchema.nullable(),
    postingDetails: publicPostingDetailsSchema.optional(),
  }),
  /** Plan again with the Provider's answers and the Drafts you accepted. */
  z.strictObject({ type: z.literal('feedback'), provider: providerFeedbackSchema }),
  /** The Fill is over: clear the outlines and stop watching the page. */
  z.strictObject({ type: z.literal('endSession') }),
]);
export type ContentRequest = z.infer<typeof contentRequestSchema>;

export const pongSchema = z.object({
  type: z.literal('pong'),
  ats: atsIdSchema,
  url: z.string(),
  topFrame: z.boolean(),
});
export type Pong = z.infer<typeof pongSchema>;

export const detectedSchema = z.strictObject({
  type: z.literal('detected'),
  ats: atsIdSchema,
  url: z.string(),
  topFrame: z.boolean(),
  /** Fields on the Application Form; 0 when this frame shows only the confirmation. */
  fieldCount: z.int().min(0),
  posting: postingSchema.nullable(),
  /** The ATS shows its confirmation screen: you submitted. */
  confirmed: z.boolean(),
  /**
   * A company site's own text about the job, when it has no public API and
   * no description in JSON-LD: kept in the Snapshot only, never sent to a
   * Provider (fill's postingPageText).
   */
  pageText: z.string().max(100_000).optional(),
});
export type Detected = z.infer<typeof detectedSchema>;

/** A field's Draft request (fill's DraftRequestRef). Build its context with core's toDraftContext. */
export const draftRequestSchema = z.strictObject({
  fieldId: z.string(),
  fieldType: ordinaryFieldTypeSchema,
  question: draftQuestionSchema,
  mode: z.enum(['write', 'polish']),
  posting: draftPostingSchema,
  employer: employerKeySchema.optional(),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const fieldViewSchema = z.strictObject({
  fieldId: z.string(),
  label: z.string(),
  section: z.string().optional(),
  required: z.boolean(),
  control: controlKindSchema,
  optionCount: z.int().min(0),
  fieldType: fieldTypeSchema,
  classifiedBy: z.enum(['adapter', 'autocomplete', 'rules', 'savedAnswer', 'provider']),
  /** Null while the field waits for the Provider. */
  outcome: fieldOutcomeSchema.nullable(),
  awaiting: z.enum(['mapping', 'draft']).optional(),
  /** False once the field left the page (an earlier step of the form). */
  onPage: z.boolean(),
  /** You changed it on the page after the Fill; no re-plan writes it. */
  userEdited: z.boolean(),
  /**
   * From your own data: a similar Saved Answer, or a weak Provider match.
   * Shown in the side panel only, never in the debug report.
   */
  suggestion: z.string().optional(),
  byCountry: z.array(z.strictObject({ country: countryCodeSchema, text: z.string() })).optional(),
  candidates: z.array(z.string()).optional(),
  /** Set for free-text questions and cover letters: the Draft button. */
  draft: draftRequestSchema.optional(),
});
export type FieldView = z.infer<typeof fieldViewSchema>;

/** One Fill as the side panel shows it. DOM-free, and plain JSON. */
export const fillViewSchema = z.strictObject({
  ats: atsIdSchema,
  url: z.string(),
  posting: postingSchema.nullable(),
  aiPolicy: z.boolean(),
  fields: z.array(fieldViewSchema),
  /** The mapFields input, built in the content script by core's toProviderField. */
  providerRequest: mapFieldsInputSchema.nullable(),
  /** What the form shows now, for the Snapshot. */
  answers: z.array(submittedAnswerSchema),
  resume: resumeRefSchema.nullable(),
});
export type FillView = z.infer<typeof fillViewSchema>;

/** `noAccess`: employ-me may not read the page (the generic fallback, before the toolbar click). */
export const CONTENT_ERROR_REASONS = ['noForm', 'noSession', 'dataUnavailable', 'noAccess'] as const;
export const contentErrorSchema = z.strictObject({
  reason: z.enum(CONTENT_ERROR_REASONS),
  message: z.string(),
  fix: z.string().min(1),
});
export type ContentError = z.infer<typeof contentErrorSchema>;

export const fillAnswerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('filled'), view: fillViewSchema }),
  z.strictObject({ type: z.literal('failed'), error: contentErrorSchema }),
]);
export type FillAnswer = z.infer<typeof fillAnswerSchema>;

/** The Fill's session port: opened by the side panel, closed when either side goes away. */
export const SESSION_PORT = 'employ-me/fill-session';

export const sessionEventSchema = z.discriminatedUnion('type', [
  /** What the form shows now, sent as you edit it and when you press its buttons (before Submit navigates away). */
  z.strictObject({ type: z.literal('answers'), answers: z.array(submittedAnswerSchema) }),
  /** fill's watchForSubmission: the ATS confirmed, or you submitted and no confirmation came. */
  z.strictObject({ type: z.literal('submission'), signal: z.enum(['confirmed', 'unclear']) }),
  /** New fields appeared: the form's next step, or questions that follow from an answer. */
  z.strictObject({ type: z.literal('formChanged') }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;
