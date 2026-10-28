import { z } from 'zod';
import { PROTOCOL_VERSION } from '../constants';
import { helperErrorSchema } from '../errors';
import {
  draftAnswerOutputSchema,
  draftContextSchema,
  mapFieldsInputSchema,
  mapFieldsOutputSchema,
  parseResumeInputSchema,
  parseResumeOutputSchema,
} from '../provider/boundary';
import { providerIdSchema, providerStatusSchema } from '../provider/provider';

// Messages between the extension and the helper, over Chrome Native
// Messaging (ADR-0001). One request, one response, matched by `id`.
// Requests are strict: the helper rejects unknown keys with
// `boundaryViolation`/`invalidRequest` rather than forwarding them.

const versionSchema = z.literal(PROTOCOL_VERSION);
export const requestIdSchema = z.string().min(1).max(64);

const base = { v: versionSchema, id: requestIdSchema };

export const healthRequestSchema = z.strictObject({ ...base, type: z.literal('health') });

export const mapFieldsRequestSchema = z.strictObject({
  ...base,
  type: z.literal('mapFields'),
  provider: providerIdSchema,
  input: mapFieldsInputSchema,
});

export const draftAnswerRequestSchema = z.strictObject({
  ...base,
  type: z.literal('draftAnswer'),
  provider: providerIdSchema,
  input: draftContextSchema,
});

export const parseResumeRequestSchema = z.strictObject({
  ...base,
  type: z.literal('parseResume'),
  provider: providerIdSchema,
  input: parseResumeInputSchema,
});

export const helperRequestSchema = z.discriminatedUnion('type', [
  healthRequestSchema,
  mapFieldsRequestSchema,
  draftAnswerRequestSchema,
  parseResumeRequestSchema,
]);
export type HelperRequest = z.infer<typeof helperRequestSchema>;
export type HelperRequestType = HelperRequest['type'];

/** Health is what `employ-me doctor` prints and what the side panel shows when the AI is unavailable. */
export const healthResultSchema = z.object({
  helperVersion: z.string(),
  protocolVersion: z.int(),
  /** True when EMPLOY_ME_PROVIDER=fake is set. Never true in a real install. */
  fakeProvider: z.boolean(),
  logFile: z.string(),
  providers: z.array(providerStatusSchema),
});
export type HealthResult = z.infer<typeof healthResultSchema>;

const okBase = { ...base, ok: z.literal(true) };

export const helperOkResponseSchema = z.discriminatedUnion('type', [
  z.object({ ...okBase, type: z.literal('health'), result: healthResultSchema }),
  z.object({ ...okBase, type: z.literal('mapFields'), result: mapFieldsOutputSchema }),
  z.object({ ...okBase, type: z.literal('draftAnswer'), result: draftAnswerOutputSchema }),
  z.object({ ...okBase, type: z.literal('parseResume'), result: parseResumeOutputSchema }),
]);

export const helperErrorResponseSchema = z.object({
  v: versionSchema,
  /** Null when the request was too malformed to read its id. */
  id: requestIdSchema.nullable(),
  ok: z.literal(false),
  error: helperErrorSchema,
});

export const helperResponseSchema = z.union([helperOkResponseSchema, helperErrorResponseSchema]);
export type HelperResponse = z.infer<typeof helperResponseSchema>;
export type HelperOkResponse = z.infer<typeof helperOkResponseSchema>;
export type HelperErrorResponse = z.infer<typeof helperErrorResponseSchema>;

/** Request and result types per method, for typed clients. */
export type HelperRequestOf<T extends HelperRequestType> = Extract<HelperRequest, { type: T }>;
export type HelperResultOf<T extends HelperRequestType> = Extract<HelperOkResponse, { type: T }>['result'];
