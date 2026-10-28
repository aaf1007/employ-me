import { err, ok, type HelperError, type HelperErrorReason, type Result } from '@employ-me/core/protocol';
import { z } from 'zod';
import { providerError } from '../errors';
import type { ProcessOutcome } from '../process';

/** The parts of `claude -p --output-format json` we read. Everything else is ignored. */
const claudeResultSchema = z.object({
  is_error: z.boolean().default(false),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  api_error_status: z.number().nullable().optional(),
});

const NOT_LOGGED_IN = /not logged in|\/login|invalid api key|authentication|oauth token|unauthori[sz]ed/i;
const RATE_LIMITED =
  /usage limit|rate.?limit|limit reached|hit your limit|out of (extra )?usage|too many requests|quota/i;

/**
 * Turns a finished `claude -p` run into its structured output, or a
 * HelperError with a reason and a fix. Error messages are ours: the CLI's
 * own text is only matched, never passed on, so nothing it echoes leaks.
 */
export function interpretClaudeRun(outcome: ProcessOutcome): Result<unknown, HelperError> {
  switch (outcome.kind) {
    case 'notFound':
      return err(providerError('claude', 'providerNotFound', 'The claude CLI is not where setup found it'));
    case 'spawnFailed':
      return err(providerError('claude', 'providerFailed', "The claude CLI couldn't be started"));
    case 'timedOut':
      return err(providerError('claude', 'providerTimeout', 'Claude took too long to answer'));
    case 'aborted':
      return err(providerError('claude', 'providerFailed', 'The request was cancelled'));
    case 'exited':
      break;
  }
  const result = parseResult(outcome.stdout);
  if (result === null) {
    const reason = classify(outcome.stderr, null);
    return err(providerError('claude', reason, failureMessage(reason, outcome.exitCode)));
  }
  if (result.is_error) {
    const reason = classify(result.result ?? '', result.api_error_status ?? null);
    return err(providerError('claude', reason, failureMessage(reason, outcome.exitCode)));
  }
  if (result.structured_output === undefined) {
    return err(providerError('claude', 'invalidProviderOutput', 'Claude answered without structured output'));
  }
  return ok(result.structured_output);
}

function parseResult(stdout: string): z.infer<typeof claudeResultSchema> | null {
  // One JSON object; take the last line in case anything printed before it.
  const lines = stdout.trim().split('\n');
  for (const line of [stdout.trim(), lines.at(-1) ?? '']) {
    try {
      const parsed = claudeResultSchema.safeParse(JSON.parse(line));
      if (parsed.success) return parsed.data;
    } catch {
      continue;
    }
  }
  return null;
}

function classify(text: string, status: number | null): HelperErrorReason {
  if (status === 401 || status === 403 || NOT_LOGGED_IN.test(text)) return 'providerNotLoggedIn';
  if (status === 429 || RATE_LIMITED.test(text)) return 'providerRateLimited';
  return 'providerFailed';
}

function failureMessage(reason: HelperErrorReason, exitCode: number | null): string {
  if (reason === 'providerNotLoggedIn') return "Claude isn't logged in";
  if (reason === 'providerRateLimited') return "Claude's usage limit was reached";
  return `The claude CLI failed (exit code ${exitCode === null ? 'none' : String(exitCode)})`;
}
