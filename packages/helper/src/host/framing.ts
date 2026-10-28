import { endianness } from 'node:os';
import { MAX_HELPER_TO_EXTENSION_BYTES, err, ok, type Result } from '@employ-me/core/protocol';

// Chrome Native Messaging framing: each message is a 32-bit length in native
// byte order followed by that many bytes of UTF-8 JSON (research §3.3).
// Host → extension messages are capped at 1 MB (MAX_HELPER_TO_EXTENSION_BYTES).

const HEADER_BYTES = 4;
const LITTLE_ENDIAN = endianness() === 'LE';

export interface FrameTooLarge {
  readonly reason: 'messageTooLarge';
  readonly bytes: number;
}

/** Encodes one message. Fails with messageTooLarge over the cap, so the caller can send an error instead. */
export function encodeFrame(
  message: object,
  maxBytes: number = MAX_HELPER_TO_EXTENSION_BYTES,
): Result<Buffer, FrameTooLarge> {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > maxBytes) return err({ reason: 'messageTooLarge', bytes: body.length });
  const frame = Buffer.allocUnsafe(HEADER_BYTES + body.length);
  if (LITTLE_ENDIAN) frame.writeUInt32LE(body.length, 0);
  else frame.writeUInt32BE(body.length, 0);
  body.copy(frame, HEADER_BYTES);
  return ok(frame);
}

export type DecodedFrame =
  | { readonly kind: 'message'; readonly message: unknown; readonly bytes: number }
  | { readonly kind: 'invalidJson'; readonly bytes: number }
  /** The length header is over the cap. The stream can't be resynchronised, so the decoder stops. */
  | { readonly kind: 'tooLarge'; readonly bytes: number };

/** Splits a byte stream back into messages, across chunk boundaries. */
export interface FrameDecoder {
  push(chunk: Buffer): DecodedFrame[];
}

export function createFrameDecoder(maxBytes: number): FrameDecoder {
  // Chunks are kept as a list and joined once per frame: a 20 MB Resume
  // arrives in hundreds of chunks, and joining on every push is quadratic.
  let chunks: Buffer[] = [];
  let size = 0;
  let bodyBytes: number | null = null;
  let stopped = false;

  const flatten = (): Buffer => {
    const joined = Buffer.concat(chunks, size);
    chunks = [joined];
    return joined;
  };

  return {
    push(chunk) {
      if (stopped) return [];
      chunks.push(chunk);
      size += chunk.length;
      const frames: DecodedFrame[] = [];
      for (;;) {
        if (bodyBytes === null) {
          if (size < HEADER_BYTES) break;
          const head = flatten();
          bodyBytes = LITTLE_ENDIAN ? head.readUInt32LE(0) : head.readUInt32BE(0);
          if (bodyBytes > maxBytes) {
            stopped = true;
            chunks = [];
            size = 0;
            frames.push({ kind: 'tooLarge', bytes: bodyBytes });
            break;
          }
        }
        if (size < HEADER_BYTES + bodyBytes) break;
        const all = flatten();
        const body = all.subarray(HEADER_BYTES, HEADER_BYTES + bodyBytes);
        const rest = all.subarray(HEADER_BYTES + bodyBytes);
        chunks = rest.length === 0 ? [] : [rest];
        size = rest.length;
        bodyBytes = null;
        frames.push(parseBody(body));
      }
      return frames;
    },
  };
}

function parseBody(body: Buffer): DecodedFrame {
  try {
    const message: unknown = JSON.parse(body.toString('utf8'));
    return { kind: 'message', message, bytes: body.length };
  } catch {
    return { kind: 'invalidJson', bytes: body.length };
  }
}
