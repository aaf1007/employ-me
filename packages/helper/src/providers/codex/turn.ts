import { err, ok, type HelperError, type Result } from '@employ-me/core/protocol';
import { z } from 'zod';
import { providerError } from '../errors';
import type { TaskSpec } from '../task';
import type { AppServer } from './app-server';
import type { RpcFailure } from './rpc';

// One task = one ephemeral thread with one turn. A fresh thread per task
// keeps requests from seeing each other's data; the warm process is what
// saves time.

const RPC_TIMEOUT_MS = 30_000;

const threadStartSchema = z.object({ thread: z.object({ id: z.string() }) });
const turnStartSchema = z.object({ turn: z.object({ id: z.string() }) });
const turnErrorSchema = z
  .object({
    /** Only matched against known codes below, never passed on. */
    message: z.string().optional(),
    codexErrorInfo: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();
const turnCompletedSchema = z.object({
  threadId: z.string(),
  turn: z.object({ status: z.string(), error: turnErrorSchema }),
});
const itemCompletedSchema = z.object({
  threadId: z.string(),
  item: z.object({ type: z.string(), text: z.string().optional(), phase: z.string().nullable().optional() }),
});

export interface TurnOptions {
  readonly cwd: string;
  /** Null: whatever Codex picks. */
  readonly model: string | null;
}

const MODEL_NOT_FOUND = 'modelNotFound';

type TurnEnd = { readonly status: string; readonly errorInfo: string | null } | 'timedOut' | 'aborted';

/** Runs one task and returns the parsed JSON of Codex's final message. */
export async function runCodexTurn(
  server: AppServer,
  task: TaskSpec,
  options: TurnOptions,
  signal: AbortSignal,
): Promise<Result<unknown, HelperError>> {
  const thread = await server.rpc.request(
    'thread/start',
    {
      ephemeral: true,
      cwd: options.cwd,
      model: options.model,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      // Our system prompt replaces Codex's built-in coding instructions
      // (~17K tokens a call, research §3.2).
      baseInstructions: task.system,
    },
    RPC_TIMEOUT_MS,
  );
  const threadId = thread.ok ? threadStartSchema.safeParse(thread.value).data?.thread.id : undefined;
  if (threadId === undefined) return err(rpcError(thread.ok ? null : thread.error, 'start a thread'));

  // Codex marks the answer phase "final_answer"; older models leave it null.
  const answer: { final: string | null; last: string | null } = { final: null, last: null };
  let finish: (end: TurnEnd) => void = () => undefined;
  const ended = new Promise<TurnEnd>((resolve) => (finish = resolve));
  const unsubscribe = server.rpc.onNotification((method, params) => {
    if (method === 'item/completed') {
      const item = itemCompletedSchema.safeParse(params).data;
      if (item?.threadId !== threadId || item.item.type !== 'agentMessage' || item.item.text === undefined)
        return;
      answer.last = item.item.text;
      if (item.item.phase === 'final_answer') answer.final = item.item.text;
    } else if (method === 'turn/completed') {
      const done = turnCompletedSchema.safeParse(params).data;
      if (done?.threadId !== threadId) return;
      const info = done.turn.error?.codexErrorInfo;
      // The API's own code, for a model the plan can't use, arrives as "other".
      const modelNotFound = done.turn.error?.message?.includes('model_not_found') === true;
      finish({
        status: done.turn.status,
        errorInfo: modelNotFound
          ? MODEL_NOT_FOUND
          : info === undefined || info === null
            ? null
            : errorInfoName(info),
      });
    }
  });
  const timer = setTimeout(() => {
    finish('timedOut');
  }, task.timeoutMs);
  const onAbort = () => {
    finish('aborted');
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    const turn = await server.rpc.request(
      'turn/start',
      {
        threadId,
        input: [{ type: 'text', text: task.prompt, text_elements: [] }],
        outputSchema: task.schema,
        effort: task.effort === 'low' ? 'low' : null,
        summary: 'none',
      },
      RPC_TIMEOUT_MS,
    );
    const turnId = turn.ok ? turnStartSchema.safeParse(turn.value).data?.turn.id : undefined;
    if (turnId === undefined) return err(rpcError(turn.ok ? null : turn.error, 'start a turn'));

    const end = await Promise.race([
      ended,
      server.rpc.closed.then((): TurnEnd => ({ status: 'closed', errorInfo: null })),
    ]);
    if (end === 'timedOut' || end === 'aborted') {
      void server.rpc.request('turn/interrupt', { threadId, turnId }, RPC_TIMEOUT_MS);
      return err(
        end === 'timedOut'
          ? providerError('codex', 'providerTimeout', 'Codex took too long to answer')
          : providerError('codex', 'providerFailed', 'The request was cancelled'),
      );
    }
    if (end.status !== 'completed') return err(turnError(end.status, end.errorInfo));
    return parseFinalMessage(answer.final ?? answer.last);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    unsubscribe();
    // Unloads the ephemeral thread. Its result doesn't matter: nothing was persisted.
    void server.rpc.request('thread/unsubscribe', { threadId }, RPC_TIMEOUT_MS);
  }
}

function parseFinalMessage(text: string | null): Result<unknown, HelperError> {
  if (text === null)
    return err(providerError('codex', 'invalidProviderOutput', 'Codex finished without an answer'));
  try {
    return ok(JSON.parse(text));
  } catch {
    return err(providerError('codex', 'invalidProviderOutput', "Codex's answer wasn't JSON"));
  }
}

/** codexErrorInfo is a string ("usageLimitExceeded") or a one-key object ({ httpConnectionFailed: … }). */
function errorInfoName(info: string | Record<string, unknown>): string {
  return typeof info === 'string' ? info : (Object.keys(info)[0] ?? 'other');
}

/** codexErrorInfo values (v2/CodexErrorInfo.ts in `codex app-server generate-ts`) that mean the plan's limit. */
const LIMIT_REACHED = new Set(['usageLimitExceeded', 'rateLimitExceeded', 'sessionBudgetExceeded']);
/**
 * Values that mean OpenAI's service failed, after Codex's own retries.
 * responseTooManyFailedAttempts was seen live (2026-10-28) on one of two
 * concurrent Drafts; the next request worked.
 */
const SERVICE_FAILED = new Set([
  'responseTooManyFailedAttempts',
  'responseStreamDisconnected',
  'internalServerError',
  'serverOverloaded',
]);

function turnError(status: string, errorInfo: string | null): HelperError {
  if (errorInfo !== null && LIMIT_REACHED.has(errorInfo)) {
    return providerError('codex', 'providerRateLimited', "Codex's usage limit was reached");
  }
  if (errorInfo !== null && SERVICE_FAILED.has(errorInfo)) {
    return {
      reason: 'providerFailed',
      message: "OpenAI's service didn't answer Codex, even after Codex tried again",
      fix: "This is on OpenAI's side, not your setup. Click Retry in a minute. If it keeps failing, switch to Claude in Settings.",
    };
  }
  if (errorInfo === 'unauthorized')
    return providerError('codex', 'providerNotLoggedIn', "Codex isn't logged in");
  if (errorInfo === MODEL_NOT_FOUND) {
    return {
      reason: 'providerFailed',
      message: "The Codex model employ-me asked for isn't available on your plan",
      fix: 'Remove "codex" from "models" in employ-me\'s config.json (run `npx employ-me doctor` to find it) so your plan\'s default model is used, then click Retry.',
    };
  }
  if (status === 'closed')
    return providerError('codex', 'providerFailed', 'codex app-server stopped during the request');
  return providerError(
    'codex',
    'providerFailed',
    `The Codex turn ended as ${status} (${errorInfo ?? 'no error code'})`,
  );
}

function rpcError(failure: RpcFailure | null, step: string): HelperError {
  if (failure?.kind === 'timedOut')
    return providerError('codex', 'providerTimeout', `Codex didn't ${step} in time`);
  return providerError('codex', 'providerFailed', `Codex couldn't ${step}`);
}
