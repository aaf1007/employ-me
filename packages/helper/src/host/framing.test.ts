import { MAX_HELPER_TO_EXTENSION_BYTES } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { createFrameDecoder, encodeFrame } from './framing';

function frameOf(message: object, maxBytes?: number): Buffer {
  const encoded = encodeFrame(message, maxBytes);
  if (!encoded.ok) throw new Error('fixture should encode');
  return encoded.value;
}

describe('Native Messaging framing', () => {
  it('writes a 32-bit length in native byte order, then UTF-8 JSON', () => {
    const frame = frameOf({ text: 'é' });
    const body = '{"text":"é"}';
    expect(frame.readUInt32LE(0)).toBe(Buffer.byteLength(body));
    expect(frame.subarray(4).toString('utf8')).toBe(body);
  });

  it("refuses a message over Chrome's 1 MB host-to-extension cap", () => {
    const result = encodeFrame({ text: 'x'.repeat(MAX_HELPER_TO_EXTENSION_BYTES) });
    expect(result).toMatchObject({ ok: false, error: { reason: 'messageTooLarge' } });
  });

  it('decodes messages split across chunks and several in one chunk', () => {
    const decoder = createFrameDecoder(1024);
    const both = Buffer.concat([frameOf({ n: 1 }), frameOf({ n: 2 })]);
    const first = decoder.push(both.subarray(0, 3));
    const rest = decoder.push(both.subarray(3));
    expect(first).toEqual([]);
    expect(rest.map((frame) => (frame.kind === 'message' ? frame.message : null))).toEqual([
      { n: 1 },
      { n: 2 },
    ]);
  });

  it('decodes a large request (a Resume) arriving in many small chunks', () => {
    const decoder = createFrameDecoder(10 * 1024 * 1024);
    const frame = frameOf({ data: 'y'.repeat(2 * 1024 * 1024) }, 10 * 1024 * 1024);
    const frames = [];
    for (let i = 0; i < frame.length; i += 65_536)
      frames.push(...decoder.push(frame.subarray(i, i + 65_536)));
    expect(frames).toHaveLength(1);
    expect(frames[0]?.kind).toBe('message');
  });

  it('reports a body that is not JSON and carries on', () => {
    const decoder = createFrameDecoder(1024);
    const bad = Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from('{x}')]);
    const frames = decoder.push(Buffer.concat([bad, frameOf({ ok: true })]));
    expect(frames.map((frame) => frame.kind)).toEqual(['invalidJson', 'message']);
  });

  it('stops at a length over the cap, since the stream cannot be resynchronised', () => {
    const decoder = createFrameDecoder(16);
    const frames = decoder.push(Buffer.from([0xff, 0, 0, 0, 1, 2, 3]));
    expect(frames).toEqual([{ kind: 'tooLarge', bytes: 255 }]);
    expect(decoder.push(frameOf({}))).toEqual([]);
  });
});
