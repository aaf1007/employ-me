import {
  MAX_EXTENSION_TO_HELPER_BYTES,
  PROTOCOL_VERSION,
  helperError,
  type HelperError,
  type HelperResponse,
} from '@employ-me/core/protocol';
import type { Logger } from '../log/logger';
import type { ProviderRegistry } from '../providers/select';
import { dispatch } from './dispatch';
import { createFrameDecoder, encodeFrame } from './framing';
import { healthResult } from './health';

export interface HostRuntime {
  readonly logger: Logger;
  readonly logFile: string;
  readonly fakeProvider: boolean;
  readonly providers: ProviderRegistry;
}

/**
 * The Native Messaging host loop. Chrome starts it on `connectNative` and
 * keeps it alive while the port is open. Requests run concurrently and are
 * answered as they finish, matched by `id`. When stdin closes (the port
 * disconnected), in-flight requests are cancelled, which kills their CLI
 * processes, and warm Providers are stopped.
 */
export async function runHost(
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  host: HostRuntime,
): Promise<void> {
  host.logger.log({ event: 'host.start' });
  const decoder = createFrameDecoder(MAX_EXTENSION_TO_HELPER_BYTES);
  const cancel = new AbortController();
  const inFlight = new Set<Promise<void>>();
  let writable = true;
  // EPIPE: Chrome went away mid-write. Stop writing; stdin will close too.
  stdout.on('error', () => (writable = false));

  const send = (response: HelperResponse) => {
    if (!writable) return;
    const frame = encodeFrame(response);
    if (frame.ok) {
      stdout.write(frame.value);
      return;
    }
    // Over Chrome's 1 MB host-to-extension cap: answer with an error instead.
    const error = helperError(
      'messageTooLarge',
      `The answer was ${frame.error.bytes} bytes, over Chrome's 1 MB limit`,
    );
    host.logger.log({
      event: 'request.failed',
      ...(response.id === null ? {} : { requestId: response.id }),
      reason: error.reason,
      bytes: frame.error.bytes,
    });
    const fallback = encodeFrame(errorResponse(response.id, error));
    if (fallback.ok) stdout.write(fallback.value);
  };

  const deps = {
    providers: host.providers,
    logger: host.logger,
    health: () => healthResult(host.providers, { logFile: host.logFile, fakeProvider: host.fakeProvider }),
  };

  reading: for await (const chunk of stdin) {
    for (const frame of decoder.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)) {
      if (frame.kind === 'message') {
        const task = dispatch(frame.message, frame.bytes, deps, cancel.signal).then(send);
        inFlight.add(task);
        void task.finally(() => inFlight.delete(task));
        continue;
      }
      const reason = frame.kind === 'tooLarge' ? 'messageTooLarge' : 'invalidRequest';
      host.logger.log({ event: 'request.failed', reason, bytes: frame.bytes });
      send(
        errorResponse(
          null,
          helperError(
            reason,
            frame.kind === 'tooLarge' ? 'The request was over 64 MB' : 'The request was not JSON',
          ),
        ),
      );
      // A bad length header leaves no way to find the next frame.
      if (frame.kind === 'tooLarge') break reading;
    }
  }

  cancel.abort();
  await Promise.allSettled(inFlight);
  await host.providers.close();
  host.logger.log({ event: 'host.stop' });
}

function errorResponse(id: string | null, error: HelperError): HelperResponse {
  return { v: PROTOCOL_VERSION, id, ok: false, error };
}
