import { PassThrough } from 'node:stream';
import { helperResponseSchema, type HelperResponse } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../log/logger';
import { createFakeProvider, type FakeScript } from '../providers/fake';
import { createProviderRegistry } from '../providers/select';
import { createFrameDecoder, encodeFrame } from './framing';
import { runHost } from './run';

const SENTINEL = 'SENTINEL-Sam-Lee-555-0100';

const field = {
  fieldId: 'q1',
  label: `Why us? ${SENTINEL}`,
  control: 'textarea',
  options: [],
  required: true,
};
const mapFields = (id: string, provider = 'claude') => ({
  v: 1,
  id,
  type: 'mapFields',
  provider,
  input: { ats: 'greenhouse', fields: [field], savedQuestions: [] },
});

interface Run {
  readonly responses: HelperResponse[];
  readonly logs: LogEntry[];
  readonly closed: boolean;
}

/** Runs the host over in-memory pipes: sends `messages`, closes stdin, collects everything. */
async function runWith(
  messages: readonly (object | Buffer)[],
  script: FakeScript = {},
  codex = true,
): Promise<Run> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const logs: LogEntry[] = [];
  let closed = false;
  const providers = createProviderRegistry((id) =>
    id === 'codex' && !codex
      ? null
      : {
          ...createFakeProvider(id, script),
          close: () => {
            closed = true;
            return Promise.resolve();
          },
        },
  );
  const done = runHost(stdin, stdout, {
    logger: { log: (entry) => logs.push(entry) },
    logFile: '/logs/helper.log',
    fakeProvider: true,
    providers,
  });
  for (const message of messages) {
    if (Buffer.isBuffer(message)) stdin.write(message);
    else {
      const frame = encodeFrame(message);
      if (frame.ok) stdin.write(frame.value);
    }
  }
  stdin.end();
  await done;
  const decoder = createFrameDecoder(64 * 1024 * 1024);
  const written: unknown = stdout.read();
  const responses = decoder
    .push(Buffer.isBuffer(written) ? written : Buffer.alloc(0))
    .flatMap((frame) => (frame.kind === 'message' ? [helperResponseSchema.parse(frame.message)] : []));
  return { responses, logs, closed };
}

const byId = (run: Run, id: string | null) => run.responses.find((response) => response.id === id);

describe('the Native Messaging host', () => {
  it('answers health with the fake Provider flag and the log path', async () => {
    const run = await runWith([{ v: 1, id: 'h', type: 'health' }]);
    expect(byId(run, 'h')).toMatchObject({
      ok: true,
      type: 'health',
      result: { protocolVersion: 1, fakeProvider: true, logFile: '/logs/helper.log' },
    });
  });

  it('runs each request on the Provider it names and matches answers by id', async () => {
    const run = await runWith([mapFields('a'), mapFields('b', 'codex')]);
    expect(byId(run, 'a')).toMatchObject({ ok: true, type: 'mapFields' });
    expect(byId(run, 'b')).toMatchObject({ ok: true, type: 'mapFields' });
  });

  it('refuses a request smuggling Profile data past the boundary, without echoing it', async () => {
    const smuggled = {
      ...mapFields('s'),
      input: { ...mapFields('s').input, selfId: { US: { race: SENTINEL } } },
    };
    const run = await runWith([smuggled]);
    expect(byId(run, 's')).toMatchObject({ ok: false, error: { reason: 'boundaryViolation' } });
    expect(JSON.stringify(run.responses)).not.toContain(SENTINEL);
  });

  it('says which side is out of date on a protocol version mismatch', async () => {
    const run = await runWith([{ v: 2, id: 'old', type: 'health' }]);
    expect(byId(run, 'old')).toMatchObject({ ok: false, error: { reason: 'protocolMismatch' } });
  });

  it('answers a frame that is not JSON with invalidRequest and no id', async () => {
    const run = await runWith([Buffer.concat([Buffer.from([2, 0, 0, 0]), Buffer.from('{x')])]);
    expect(byId(run, null)).toMatchObject({ ok: false, error: { reason: 'invalidRequest' } });
  });

  it('reports a Provider whose CLI setup did not find, with a fix', async () => {
    const run = await runWith([mapFields('c', 'codex')], {}, false);
    const response = byId(run, 'c');
    expect(response).toMatchObject({ ok: false, error: { reason: 'providerNotFound' } });
    expect(response?.ok === false && response.error.fix).toMatch(/codex/);
  });

  it("replaces an answer over Chrome's 1 MB cap with messageTooLarge", async () => {
    const huge = { draft: { text: 'x'.repeat(1024 * 1024 + 1), language: 'en', claims: [] } };
    const draft = {
      v: 1,
      id: 'd',
      type: 'draftAnswer',
      provider: 'claude',
      input: {
        question: { label: 'Why us?', required: true },
        mode: 'write',
        posting: {},
        facts: { workHistory: [], education: [], skills: [], languages: [] },
        savedAnswers: [],
      },
    };
    const run = await runWith([draft], { draftAnswer: () => huge });
    expect(byId(run, 'd')).toMatchObject({ ok: false, error: { reason: 'messageTooLarge' } });
  });

  it('logs request type, timing and outcome, never what was said', async () => {
    const run = await runWith([mapFields('l'), { v: 1, id: 'h', type: 'health' }]);
    expect(run.logs.map((entry) => entry.event)).toEqual(
      expect.arrayContaining(['host.start', 'request.received', 'request.done', 'host.stop']),
    );
    expect(
      run.logs.find((entry) => entry.event === 'request.done' && entry.type === 'mapFields'),
    ).toMatchObject({
      requestId: 'l',
      provider: 'claude',
    });
    expect(JSON.stringify(run.logs)).not.toContain(SENTINEL);
    expect(JSON.stringify(run.logs)).not.toContain('Why us');
  });

  it('stops warm Providers when Chrome closes the port', async () => {
    const run = await runWith([mapFields('x')]);
    expect(run.closed).toBe(true);
  });
});
