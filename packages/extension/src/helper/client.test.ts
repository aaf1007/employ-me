import { PROTOCOL_VERSION, ok, type HelperRequest } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { createHelperClient } from './client';
import { createInMemoryHelper, SAMPLE_RESUME_EXTRACT } from './in-memory-transport';
import type { HelperTransport, TransportHandlers } from './transport';

const resumeInput = { fileName: 'sam.txt', mimeType: 'text/plain', dataBase64: 'U2FtIExlZQ==' } as const;

/** A transport the test drives by hand. */
function manualTransport() {
  const sent: HelperRequest[] = [];
  let handlers: TransportHandlers | undefined;
  let opened = 0;
  let closed = 0;
  const transport: HelperTransport = {
    open(h) {
      handlers = h;
      opened++;
      return {
        send: (message) => {
          sent.push(message);
          return ok(undefined);
        },
        close: () => {
          closed++;
        },
      };
    },
  };
  const connected = () => {
    if (handlers === undefined) throw new Error('not connected');
    return handlers;
  };
  return {
    transport,
    sent,
    opened: () => opened,
    closed: () => closed,
    reply: (message: unknown) => {
      connected().onMessage(message);
    },
    disconnect: (...args: Parameters<TransportHandlers['onDisconnect']>) => {
      connected().onDisconnect(...args);
    },
  };
}

describe('helper client', () => {
  it('sends versioned requests and returns the validated result', async () => {
    const helper = createInMemoryHelper();
    const client = createHelperClient(helper);
    const result = await client.request('parseResume', {
      provider: 'claude',
      model: 'sonnet',
      input: resumeInput,
    });
    expect(result).toEqual({ ok: true, value: { extract: SAMPLE_RESUME_EXTRACT } });
    expect(helper.requests[0]).toMatchObject({
      v: PROTOCOL_VERSION,
      type: 'parseResume',
      provider: 'claude',
      model: 'sonnet',
    });
  });

  it('keeps one warm connection for many requests, matching answers by id', async () => {
    const manual = manualTransport();
    const client = createHelperClient(manual.transport);
    const answer = (request: HelperRequest | undefined) => {
      manual.reply({
        v: PROTOCOL_VERSION,
        id: request?.id,
        ok: true,
        type: 'health',
        result: {
          helperVersion: request?.id,
          protocolVersion: 1,
          fakeProvider: true,
          logFile: 'x',
          providers: [],
        },
      });
    };
    const first = client.request('health', {});
    const second = client.request('health', {});
    const [a, b] = manual.sent;
    answer(b);
    answer(a);
    expect(await first).toMatchObject({ ok: true, value: { helperVersion: a?.id } });
    expect(await second).toMatchObject({ ok: true, value: { helperVersion: b?.id } });

    const third = client.request('health', {});
    answer(manual.sent[2]);
    expect((await third).ok).toBe(true);
    expect(manual.opened()).toBe(1);
  });

  it("surfaces a missing helper as helperNotInstalled with setup's fix, then reconnects once it's installed", async () => {
    const helper = createInMemoryHelper();
    helper.configure({ installed: false });
    const client = createHelperClient(helper);
    expect(await client.request('health', {})).toMatchObject({
      ok: false,
      error: {
        reason: 'helperNotInstalled',
        fix: 'Run `npx employ-me setup` in a terminal, then click Retry.',
      },
    });
    helper.configure({ installed: true });
    expect((await client.request('health', {})).ok).toBe(true);
  });

  it('fails waiting requests when the helper goes away', async () => {
    const manual = manualTransport();
    const client = createHelperClient(manual.transport);
    const pending = client.request('parseResume', { provider: 'codex', input: resumeInput });
    manual.disconnect({ reason: 'helperDisconnected', message: 'The helper stopped.', fix: 'Click Retry.' });
    expect(await pending).toMatchObject({ ok: false, error: { reason: 'helperDisconnected' } });
    // The next request opens a fresh connection.
    void client.request('health', {});
    expect(manual.opened()).toBe(2);
  });

  it('refuses a request that fails the protocol schema without sending it', async () => {
    const manual = manualTransport();
    const client = createHelperClient(manual.transport);
    const result = await client.request('parseResume', {
      provider: 'claude',
      model: '--yolo',
      input: resumeInput,
    });
    expect(result).toMatchObject({ ok: false, error: { reason: 'invalidRequest' } });
    expect(manual.sent).toEqual([]);
  });

  it('turns unreadable, mismatched and wrong-type answers into errors', async () => {
    const manual = manualTransport();
    const client = createHelperClient(manual.transport);

    const garbled = client.request('health', {});
    manual.reply({ hello: 'world' });
    expect(await garbled).toMatchObject({ ok: false, error: { reason: 'internal' } });

    const otherVersion = client.request('health', {});
    manual.reply({ v: 2, id: manual.sent[1]?.id, ok: true });
    expect(await otherVersion).toMatchObject({ ok: false, error: { reason: 'protocolMismatch' } });

    const wrongType = client.request('parseResume', { provider: 'claude', input: resumeInput });
    manual.reply({ v: 1, id: manual.sent[2]?.id, ok: true, type: 'mapFields', result: { mappings: [] } });
    expect(await wrongType).toMatchObject({ ok: false, error: { reason: 'internal' } });

    const failed = client.request('parseResume', { provider: 'claude', input: resumeInput });
    manual.reply({
      v: 1,
      id: manual.sent[3]?.id,
      ok: false,
      error: { reason: 'providerNotLoggedIn', message: 'Not logged in', fix: 'Log in.' },
    });
    expect(await failed).toMatchObject({
      ok: false,
      error: { reason: 'providerNotLoggedIn', fix: 'Log in.' },
    });
  });

  it('gives up on a request the helper never answers', async () => {
    const manual = manualTransport();
    const client = createHelperClient(manual.transport, { timeoutMs: { parseResume: 5, health: 5 } });
    expect(await client.request('parseResume', { provider: 'claude', input: resumeInput })).toMatchObject({
      ok: false,
      error: { reason: 'providerTimeout' },
    });
    // A health check that hangs means the helper is stuck: the connection is closed.
    expect(await client.request('health', {})).toMatchObject({
      ok: false,
      error: { reason: 'helperDisconnected' },
    });
    expect(manual.closed()).toBe(1);
  });

  it('closes the connection once idle, so the helper can exit', async () => {
    const manual = manualTransport();
    const client = createHelperClient(manual.transport, { idleCloseMs: 1 });
    const pending = client.request('health', {});
    manual.reply({
      v: 1,
      id: manual.sent[0]?.id,
      ok: true,
      type: 'health',
      result: { helperVersion: '1', protocolVersion: 1, fakeProvider: false, logFile: 'x', providers: [] },
    });
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(manual.closed()).toBe(1);
  });
});
