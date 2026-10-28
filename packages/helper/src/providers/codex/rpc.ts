import { createInterface } from 'node:readline';
import { err, ok, type Result } from '@employ-me/core/protocol';
import { z } from 'zod';

// `codex app-server` speaks JSON-RPC over stdio: one JSON object per line,
// without the "jsonrpc" member (see `codex app-server generate-json-schema`,
// JSONRPCMessage). Requests carry an id; notifications don't; the server may
// also send requests of its own (approvals, user input).

const incomingSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});

export type RpcFailure =
  | { readonly kind: 'remote'; readonly code: number }
  | { readonly kind: 'closed' }
  | { readonly kind: 'timedOut' };

export type NotificationListener = (method: string, params: unknown) => void;

export interface RpcClient {
  request(method: string, params: unknown, timeoutMs: number): Promise<Result<unknown, RpcFailure>>;
  notify(method: string, params?: unknown): void;
  /** Returns the unsubscribe function. */
  onNotification(listener: NotificationListener): () => void;
  /** Resolves once the server's stdout ends. */
  readonly closed: Promise<void>;
  isClosed(): boolean;
}

/** JSON-RPC error code we answer every server request with. */
const REFUSED = -32601;

export function createRpcClient(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): RpcClient {
  const pending = new Map<number, (result: Result<unknown, RpcFailure>) => void>();
  const listeners = new Set<NotificationListener>();
  let nextId = 1;
  let isClosed = false;

  const send = (message: object) => {
    if (!isClosed) output.write(`${JSON.stringify(message)}\n`);
  };

  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', (line) => {
    const message = parseLine(line);
    if (message === null) return;
    const { id, method } = message;
    if (id !== undefined && method !== undefined) {
      // Tools are off and approvals are "never", so nothing should ask. If
      // something does, the answer is no (design.md "AI": every tool off).
      send({ id, error: { code: REFUSED, message: 'employ-me answers no requests from Codex' } });
    } else if (id !== undefined) {
      const settle = typeof id === 'number' ? pending.get(id) : undefined;
      if (settle === undefined) return;
      pending.delete(Number(id));
      settle(
        message.error === undefined ? ok(message.result) : err({ kind: 'remote', code: message.error.code }),
      );
    } else if (method !== undefined) {
      for (const listener of listeners) listener(method, message.params);
    }
  });

  const closed = new Promise<void>((resolve) => {
    lines.on('close', () => {
      isClosed = true;
      for (const settle of pending.values()) settle(err({ kind: 'closed' }));
      pending.clear();
      resolve();
    });
  });

  return {
    closed,
    isClosed: () => isClosed,
    request(method, params, timeoutMs) {
      if (isClosed) return Promise.resolve(err({ kind: 'closed' }));
      const id = nextId++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(err({ kind: 'timedOut' }));
        }, timeoutMs);
        pending.set(id, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        send({ id, method, params });
      });
    },
    notify(method, params) {
      send(params === undefined ? { method } : { method, params });
    },
    onNotification(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One protocol line, or null for anything that isn't one (the server logs to stderr, not here). */
function parseLine(line: string): z.infer<typeof incomingSchema> | null {
  if (line.trim() === '') return null;
  try {
    const parsed = incomingSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
