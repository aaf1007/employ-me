import {
  PROTOCOL_VERSION,
  helperError,
  helperRequestSchema,
  requestIdSchema,
  type HealthResult,
  type HelperError,
  type HelperRequest,
  type HelperResponse,
  type Result,
} from '@employ-me/core/protocol';
import type { z } from 'zod';
import type { Logger } from '../log/logger';
import { providerError } from '../providers/errors';
import type { ProviderRegistry } from '../providers/select';

export interface DispatchDeps {
  readonly providers: ProviderRegistry;
  readonly logger: Logger;
  readonly health: () => Promise<HealthResult>;
}

/**
 * Validates one raw message with `helperRequestSchema` (strict, so smuggled
 * keys are refused, never forwarded), runs it on the chosen Provider, and
 * always resolves to a response: errors are HelperErrorResponse values with
 * a reason and a fix, never throws. Logs type, timing and outcome only.
 */
export async function dispatch(
  raw: unknown,
  bytes: number,
  deps: DispatchDeps,
  signal: AbortSignal,
): Promise<HelperResponse> {
  const started = performance.now();
  const parsed = helperRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const error = invalid(raw, parsed.error);
    const id = idOf(raw);
    deps.logger.log({
      event: 'request.failed',
      ...(id === null ? {} : { requestId: id }),
      bytes,
      reason: error.reason,
    });
    return { v: PROTOCOL_VERSION, id, ok: false, error };
  }
  const request = parsed.data;
  const provider = request.type === 'health' ? undefined : request.provider;
  const context = {
    requestId: request.id,
    type: request.type,
    ...(provider === undefined ? {} : { provider }),
  };
  deps.logger.log({ event: 'request.received', ...context, bytes });

  const response = await run(request, deps, signal);
  const durationMs = Math.round(performance.now() - started);
  deps.logger.log(
    response.ok
      ? { event: 'request.done', ...context, durationMs }
      : { event: 'request.failed', ...context, durationMs, reason: response.error.reason },
  );
  return response;
}

async function run(request: HelperRequest, deps: DispatchDeps, signal: AbortSignal): Promise<HelperResponse> {
  const base = { v: PROTOCOL_VERSION, id: request.id } as const;
  const failed = (error: HelperError): HelperResponse => ({ ...base, ok: false, error });
  if (request.type === 'health') return { ...base, ok: true, type: 'health', result: await deps.health() };

  const provider = deps.providers.get(request.provider);
  if (provider === null) {
    return failed(
      providerError(request.provider, 'providerNotFound', `Setup didn't find the ${request.provider} CLI`),
    );
  }
  const respond = <T>(result: Result<T, HelperError>, ok: (value: T) => HelperResponse) =>
    result.ok ? ok(result.value) : failed(result.error);
  switch (request.type) {
    case 'mapFields':
      return respond(await provider.mapFields(request.input, signal), (result) => ({
        ...base,
        ok: true,
        type: 'mapFields',
        result,
      }));
    case 'draftAnswer':
      return respond(await provider.draftAnswer(request.input, signal), (result) => ({
        ...base,
        ok: true,
        type: 'draftAnswer',
        result,
      }));
    case 'parseResume':
      return respond(await provider.parseResume(request.input, signal), (result) => ({
        ...base,
        ok: true,
        type: 'parseResume',
        result,
      }));
  }
}

/**
 * Why a message was refused. Only issue paths go in the message, never
 * values: a smuggled Self-ID Answer must not end up in an error or a log.
 */
function invalid(raw: unknown, error: z.ZodError): HelperError {
  if (isRecord(raw) && raw['v'] !== PROTOCOL_VERSION) {
    return helperError(
      'protocolMismatch',
      `The extension speaks another protocol version; this helper speaks ${PROTOCOL_VERSION}`,
    );
  }
  const paths = error.issues.map((issue) => issue.path.map(String).join('.') || '(root)');
  const smuggled = error.issues.some(
    (issue) => issue.code === 'unrecognized_keys' && issue.path[0] === 'input',
  );
  return smuggled
    ? helperError(
        'boundaryViolation',
        `The request carried fields the Provider boundary doesn't allow, at ${paths.join(', ')}`,
      )
    : helperError('invalidRequest', `The request didn't match the protocol, at ${paths.join(', ')}`);
}

function idOf(raw: unknown): string | null {
  const id = requestIdSchema.safeParse(isRecord(raw) ? raw['id'] : undefined);
  return id.success ? id.data : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
