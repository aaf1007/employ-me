import {
  applicationSchema,
  draftAnswerOutputSchema,
  draftContextSchema,
  employerKeySchema,
  healthResultSchema,
  helperErrorSchema,
  idSchema,
  mapFieldsInputSchema,
  mapFieldsOutputSchema,
  nonEmptyText,
  ordinaryFieldTypeSchema,
  parseResumeOutputSchema,
  postingKeySchema,
  postingSchema,
  profileSchema,
  resumeMetaSchema,
  savedAnswerSchema,
  snapshotSchema,
} from '@employ-me/core';
import { z } from 'zod';
import { applicationSummarySchema, dataErrorSchema, settingsSchema } from '../storage';

// The background's message API, for the side panel and the ATS content
// script (the dashboard reads and writes the data API directly, and calls the
// helper through here). Runtime messages are JSON, and anything running in a
// job site's tab can send one, so both directions are parsed with these
// schemas, and each message says who may send it.

/** Who may send a message. Content scripts run inside job sites' pages. */
export type Audience = 'extensionPages' | 'extensionPagesAndContentScripts';

const message = <Request extends z.ZodType, Response extends z.ZodType>(
  audience: Audience,
  request: Request,
  response: Response,
) => ({ audience, request, response });

const noPayload = z.strictObject({});

export const BACKGROUND_API = {
  /** The whole Profile, Self-ID Answers included: the Fill fills locally from it. */
  'profile.get': message('extensionPagesAndContentScripts', noPayload, profileSchema),
  'settings.get': message('extensionPagesAndContentScripts', noPayload, settingsSchema),
  /** A Resume's file, for a file input. Without an id, the default Resume. */
  'resumes.getFile': message(
    'extensionPagesAndContentScripts',
    z.strictObject({ resumeId: idSchema.optional() }),
    z.strictObject({ meta: resumeMetaSchema, dataBase64: z.base64() }),
  ),
  /** Applications for this Posting, for the already-applied warning. */
  'applications.findByPosting': message(
    'extensionPagesAndContentScripts',
    z.strictObject({ key: postingKeySchema }),
    z.array(applicationSummarySchema),
  ),
  /** A confirmed submission: the ATS showed its confirmation, or you said yes to "Did you apply?". */
  'applications.recordSubmission': message(
    'extensionPagesAndContentScripts',
    z.strictObject({
      source: z.enum(['confirmation', 'didYouApply']),
      posting: postingSchema,
      snapshot: snapshotSchema,
    }),
    applicationSchema,
  ),
  /**
   * A Draft you accepted becomes a Saved Answer. `fieldType` must be
   * ordinary: Self-ID and Attestation fields are refused here too.
   */
  'savedAnswers.saveAcceptedDraft': message(
    'extensionPagesAndContentScripts',
    z.strictObject({
      question: nonEmptyText.max(2000),
      answer: z.string().max(20_000),
      fieldType: ordinaryFieldTypeSchema,
      employer: employerKeySchema.optional(),
    }),
    savedAnswerSchema,
  ),

  // The helper. Extension pages only: a job site's page must not be able to
  // spend your plan. The Provider and model come from Settings.
  /** What `employ-me doctor` reports. */
  'helper.health': message('extensionPages', noPayload, healthResultSchema),
  /** Reads a stored Resume once to pre-fill the Profile (design.md "Setup"). */
  'helper.parseResume': message(
    'extensionPages',
    z.strictObject({ resumeId: idSchema.optional() }),
    parseResumeOutputSchema,
  ),
  /** Build `input` with core's toProviderField and toProviderSavedQuestion. */
  'helper.mapFields': message(
    'extensionPages',
    z.strictObject({ input: mapFieldsInputSchema }),
    mapFieldsOutputSchema,
  ),
  /** Build `input` with core's toDraftContext. */
  'helper.draftAnswer': message(
    'extensionPages',
    z.strictObject({ input: draftContextSchema }),
    draftAnswerOutputSchema,
  ),
} as const;

export type BackgroundApi = typeof BACKGROUND_API;
export type BackgroundMessageType = keyof BackgroundApi;
export const BACKGROUND_MESSAGE_TYPES = Object.keys(BACKGROUND_API) as [
  BackgroundMessageType,
  ...BackgroundMessageType[],
];

/**
 * What a sender passes. It is the schema's *output* type, so branded Provider
 * inputs must come from core's `to*` functions, never be written by hand.
 */
export type BackgroundRequest<T extends BackgroundMessageType> = z.output<BackgroundApi[T]['request']>;
export type BackgroundResponse<T extends BackgroundMessageType> = z.output<BackgroundApi[T]['response']>;

export interface MessageSpec<T extends BackgroundMessageType> {
  readonly audience: Audience;
  readonly request: z.ZodType<BackgroundRequest<T>>;
  readonly response: z.ZodType<BackgroundResponse<T>>;
}

/**
 * BACKGROUND_API typed per message, so generic code can index it with a type
 * parameter and get that message's types back, without casts.
 */
export const BACKGROUND_SPECS: { readonly [T in BackgroundMessageType]: MessageSpec<T> } = BACKGROUND_API;

export const MESSAGE_ERROR_REASONS = ['invalidMessage', 'forbidden', 'backgroundUnavailable'] as const;
export const messageErrorSchema = z.object({
  reason: z.enum(MESSAGE_ERROR_REASONS),
  message: z.string(),
  fix: z.string().min(1),
});
export type MessageError = z.infer<typeof messageErrorSchema>;

export const MESSAGE_ERROR_FIXES: Readonly<Record<MessageError['reason'], string>> = {
  invalidMessage: 'This is a bug in employ-me. Reload the extension; if it keeps happening, open an issue.',
  forbidden: 'This is a bug in employ-me: a page asked for something it may not. Open an issue.',
  backgroundUnavailable: 'Reload employ-me from chrome://extensions, then try again.',
};

export function messageError(reason: MessageError['reason'], detail: string): MessageError {
  return { reason, message: detail, fix: MESSAGE_ERROR_FIXES[reason] };
}

/** Every error the background can answer with. Each has a reason, a message and a fix. */
export const backgroundErrorSchema = z.union([helperErrorSchema, dataErrorSchema, messageErrorSchema]);
export type BackgroundError = z.infer<typeof backgroundErrorSchema>;

/** Messages to the background carry this, so other runtime messages are left alone. */
export const BACKGROUND_ADDRESS = 'employ-me/background';

export const envelopeSchema = z.strictObject({
  to: z.literal(BACKGROUND_ADDRESS),
  type: z.enum(BACKGROUND_MESSAGE_TYPES),
  payload: z.unknown(),
});

export function responseSchemaFor<T extends BackgroundMessageType>(type: T) {
  const value: z.ZodType<BackgroundResponse<T>> = BACKGROUND_SPECS[type].response;
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: backgroundErrorSchema }),
  ]);
}
