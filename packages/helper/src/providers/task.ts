import type {
  DraftAnswerOutput,
  DraftContext,
  HelperError,
  MapFieldsInput,
  MapFieldsOutput,
  ParseResumeInput,
  ParseResumeOutput,
  Provider,
  ProviderStatus,
  Result,
} from '@employ-me/core/protocol';

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

/**
 * Runs a task and returns the CLI's structured output, unparsed. `model` is
 * already checked (model.ts); null means the engine's own default.
 */
export type TaskRunner = (
  task: TaskSpec,
  signal: AbortSignal,
  model: string | null,
) => Promise<Result<unknown, HelperError>>;

/**
 * A Provider the host owns for its lifetime. `close` stops anything it keeps
 * warm. Each call may name a model (the request's, from Settings); it wins
 * over config.json's, which wins over the default.
 */
export interface HelperProvider extends Provider {
  mapFields(
    input: MapFieldsInput,
    signal: AbortSignal,
    model?: string,
  ): Promise<Result<MapFieldsOutput, HelperError>>;
  draftAnswer(
    input: DraftContext,
    signal: AbortSignal,
    model?: string,
  ): Promise<Result<DraftAnswerOutput, HelperError>>;
  parseResume(
    input: ParseResumeInput,
    signal: AbortSignal,
    model?: string,
  ): Promise<Result<ParseResumeOutput, HelperError>>;
  close(): Promise<void>;
}

export interface ProviderEngine {
  /** config.json's model for this engine; a request's model wins over it. */
  readonly configuredModel?: string;
  readonly status: () => Promise<ProviderStatus>;
  readonly run: TaskRunner;
  readonly close?: () => Promise<void>;
}
