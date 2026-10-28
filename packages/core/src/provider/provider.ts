import { z } from 'zod';
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

export const providerStatusSchema = z.object({
  id: providerIdSchema,
  state: z.enum(['ready', 'notFound', 'notLoggedIn', 'unknown']),
  /** Absolute path recorded at setup (Chrome launched from the Dock has no shell PATH). */
  path: z.string().optional(),
  version: z.string().optional(),
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
