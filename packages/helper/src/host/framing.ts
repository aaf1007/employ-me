// Chrome Native Messaging framing: each message is a 32-bit length in native
// byte order (little-endian on every platform we support) followed by that
// many bytes of UTF-8 JSON. Host → extension messages are capped at 1 MB
// (MAX_HELPER_TO_EXTENSION_BYTES). This module is the only place in the host
// allowed to touch process.stdout.

/** Encodes one message. Fails with messageTooLarge over the 1 MB cap. */
export function encodeFrame(_message: unknown): Buffer {
  throw new Error('not implemented');
}

/** Splits a byte stream back into messages, across chunk boundaries. */
export interface FrameDecoder {
  push(chunk: Buffer): unknown[];
}

export function createFrameDecoder(_maxBytes: number): FrameDecoder {
  throw new Error('not implemented');
}
