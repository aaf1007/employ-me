import type { HelperError, Provider, ProviderStatus, Result } from '@employ-me/core/protocol';

export type JsonSchema = Readonly<Record<string, unknown>>;

/**
 * One structured call to a Provider, independent of which CLI runs it.
 * Built by src/prompts; run by the Claude or Codex engine.
 */
export interface TaskSpec {
  readonly type: 'mapFields' | 'draftAnswer' | 'parseResume';
  readonly system: string;
  /** Holds the request data. Sent on stdin (Claude) or as the turn input (Codex), never in argv. */
  readonly prompt: string;
  /** JSON Schema for the answer: `--json-schema` for Claude, `outputSchema` for Codex. */
  readonly schema: JsonSchema;
  /** Matching fields is easy: low reasoning effort (design.md "Default models"). */
  readonly effort: 'low' | 'default';
  readonly timeoutMs: number;
}

/** Runs a task and returns the CLI's structured output, unparsed. */
export type TaskRunner = (task: TaskSpec, signal: AbortSignal) => Promise<Result<unknown, HelperError>>;

/** A Provider the host owns for its lifetime. `close` stops anything it keeps warm. */
export interface HelperProvider extends Provider {
  close(): Promise<void>;
}

export interface ProviderEngine {
  readonly status: () => Promise<ProviderStatus>;
  readonly run: TaskRunner;
  readonly close?: () => Promise<void>;
}
