import {
  draftAnswerOutputSchema,
  err,
  healthResultSchema,
  helperError,
  helperRequestSchema,
  helperResponseSchema,
  mapFieldsOutputSchema,
  MAX_EXTENSION_TO_HELPER_BYTES,
  ok,
  parseResumeOutputSchema,
  PROTOCOL_VERSION,
  type HelperError,
  type HelperRequestOf,
  type HelperRequestType,
  type HelperResultOf,
  type Result,
} from '@employ-me/core';
import { z } from 'zod';
import type { HelperConnection, HelperTransport } from './transport';

/** A request's own fields: the client adds the protocol version and the id. */
export type HelperRequestBody<T extends HelperRequestType> = Omit<HelperRequestOf<T>, 'v' | 'id' | 'type'>;

/**
 * The extension's end of the helper protocol (ADR-0001). It keeps one
 * connection open so the helper stays warm, matches responses to requests by
 * `id`, and validates both directions with core's schemas. A missing helper
 * comes back as `helperNotInstalled` with its fix; it never throws, so it
 * never blocks a Fill (design.md "AI").
 */
export interface HelperClient {
  request<T extends HelperRequestType>(
    type: T,
    body: HelperRequestBody<T>,
  ): Promise<Result<HelperResultOf<T>, HelperError>>;
  /** Closes the connection. Requests still waiting fail with `helperDisconnected`. */
  close(): void;
}

export interface HelperClientOptions {
  readonly timeoutMs?: Partial<Record<HelperRequestType, number>>;
  /** Close the connection after this long with nothing in flight, so the helper process can exit. */
  readonly idleCloseMs?: number;
  readonly newId?: () => string;
}

const TIMEOUT_MS: Readonly<Record<HelperRequestType, number>> = {
  health: 10_000,
  mapFields: 120_000,
  draftAnswer: 180_000,
  parseResume: 180_000,
};
const IDLE_CLOSE_MS = 5 * 60_000;

const RESULT_SCHEMAS: { readonly [T in HelperRequestType]: z.ZodType<HelperResultOf<T>> } = {
  health: healthResultSchema,
  mapFields: mapFieldsOutputSchema,
  draftAnswer: draftAnswerOutputSchema,
  parseResume: parseResumeOutputSchema,
};

// Just enough of a message to route it when it fails the response schema.
const routableSchema = z.object({ v: z.unknown(), id: z.string().nullish() });

interface Pending {
  /** Delivers the helper's answer: the response's type and result, or an error. */
  readonly settle: (answer: Result<{ type: HelperRequestType; result: unknown }, HelperError>) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export function createHelperClient(
  transport: HelperTransport,
  options: HelperClientOptions = {},
): HelperClient {
  const timeouts = { ...TIMEOUT_MS, ...options.timeoutMs };
  const idleCloseMs = options.idleCloseMs ?? IDLE_CLOSE_MS;
  let counter = 0;
  const newId = options.newId ?? (() => `${String(Date.now())}-${String(++counter)}`);
  const pending = new Map<string, Pending>();
  let connection: HelperConnection | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = (id: string, answer: Parameters<Pending['settle']>[0]) => {
    const entry = pending.get(id);
    if (entry === undefined) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.settle(answer);
    if (pending.size === 0 && connection !== null) {
      idleTimer = setTimeout(close, idleCloseMs);
    }
  };

  const failAll = (error: HelperError) => {
    for (const id of [...pending.keys()]) settle(id, err(error));
  };

  const drop = (error: HelperError) => {
    connection = null;
    clearTimeout(idleTimer);
    failAll(error);
  };

  const onMessage = (raw: unknown) => {
    const parsed = helperResponseSchema.safeParse(raw);
    if (!parsed.success) {
      const routable = routableSchema.safeParse(raw);
      const error =
        routable.success && routable.data.v !== PROTOCOL_VERSION
          ? helperError('protocolMismatch', 'The helper speaks a different protocol version.')
          : helperError('internal', "The helper sent a message employ-me couldn't read.");
      const id = routable.success ? routable.data.id : undefined;
      if (typeof id === 'string' && pending.has(id)) settle(id, err(error));
      else failAll(error);
      return;
    }
    const response = parsed.data;
    if (response.id === null) {
      if (!response.ok) failAll(response.error);
      return;
    }
    settle(
      response.id,
      response.ok ? ok({ type: response.type, result: response.result }) : err(response.error),
    );
  };

  const ensureConnection = (): HelperConnection => {
    clearTimeout(idleTimer);
    connection ??= transport.open({ onMessage, onDisconnect: drop });
    return connection;
  };

  function close() {
    clearTimeout(idleTimer);
    const open = connection;
    connection = null;
    open?.close();
    failAll(helperError('helperDisconnected', 'The connection to the helper was closed.'));
  }

  return {
    request(type, body) {
      const parsed = helperRequestSchema.safeParse({ ...body, v: PROTOCOL_VERSION, id: newId(), type });
      if (!parsed.success) {
        return Promise.resolve(
          err(helperError('invalidRequest', `The ${type} request doesn't match the helper protocol.`)),
        );
      }
      const message = parsed.data;
      if (new TextEncoder().encode(JSON.stringify(message)).length > MAX_EXTENSION_TO_HELPER_BYTES) {
        return Promise.resolve(
          err(helperError('messageTooLarge', `The ${type} request is over Chrome's limit.`)),
        );
      }

      const resultSchema: z.ZodType<HelperResultOf<typeof type>> = RESULT_SCHEMAS[type];
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          settle(message.id, err(timeoutError(type)));
          // A helper that doesn't answer health is stuck: start a fresh one next time.
          if (type === 'health') close();
        }, timeouts[type]);
        pending.set(message.id, {
          timer,
          settle: (answer) => {
            if (!answer.ok) {
              resolve(answer);
            } else if (answer.value.type !== type) {
              resolve(err(helperError('internal', 'The helper answered a different request.')));
            } else {
              const result = resultSchema.safeParse(answer.value.result);
              resolve(
                result.success
                  ? ok(result.data)
                  : err(
                      helperError('invalidProviderOutput', "The helper's answer didn't match the protocol."),
                    ),
              );
            }
          },
        });
        const sent = ensureConnection().send(message);
        if (!sent.ok) drop(sent.error);
      });
    },
    close,
  };
}

function timeoutError(type: HelperRequestType): HelperError {
  return type === 'health'
    ? helperError('helperDisconnected', "The helper didn't answer.")
    : helperError('providerTimeout', `The AI didn't answer the ${type} request in time.`);
}
