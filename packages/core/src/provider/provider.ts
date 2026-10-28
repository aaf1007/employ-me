import { z } from 'zod';
import { isoDateTimeSchema } from '../common';
import { helperErrorSchema, type HelperError } from '../errors';
import type { Result } from '../result';
import type {
  DraftAnswerOutput,
  DraftContext,
  MapFieldsInput,
  MapFieldsOutput,
  ParseResumeInput,
  ParseResumeOutput,
} from './boundary';

/** Providers are Claude and Codex, each through the user's own CLI (design.md "AI"). */
export const PROVIDER_IDS = ['claude', 'codex'] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** One usage window of the user's plan, when the CLI reports it (Codex's `account/rateLimits/read`). */
export const providerQuotaSchema = z.object({
  /** Share of this window's allowance still unused, 0 to 100. */
  remainingPercent: z.number().min(0).max(100),
  /** Window length: 300 is the 5-hour window, 10080 the weekly one. */
  windowMinutes: z.int().positive().optional(),
  resetsAt: isoDateTimeSchema.optional(),
});
export type ProviderQuota = z.infer<typeof providerQuotaSchema>;

export const providerStatusSchema = z.object({
  id: providerIdSchema,
  state: z.enum(['ready', 'notFound', 'notLoggedIn', 'unknown']),
  /** Absolute path recorded at setup (Chrome launched from the Dock has no shell PATH). */
  path: z.string().optional(),
  version: z.string().optional(),
  /** Remaining plan usage, when the CLI reports it. */
  quota: z.array(providerQuotaSchema).optional(),
  problem: helperErrorSchema.optional(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export type ProviderError = HelperError;

/**
 * One Provider. Implementations live in the helper today; an API-key Provider
 * could implement this anywhere (ADR-0002 requires Claude to stay swappable).
 * Inputs are already validated against the boundary schemas.
 */
export interface Provider {
  readonly id: ProviderId;
  /** True for the test-only fake standing in for `id`. */
  readonly isFake: boolean;
  status(): Promise<ProviderStatus>;
  mapFields(input: MapFieldsInput, signal: AbortSignal): Promise<Result<MapFieldsOutput, ProviderError>>;
  draftAnswer(input: DraftContext, signal: AbortSignal): Promise<Result<DraftAnswerOutput, ProviderError>>;
  parseResume(
    input: ParseResumeInput,
    signal: AbortSignal,
  ): Promise<Result<ParseResumeOutput, ProviderError>>;
}
