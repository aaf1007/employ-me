import { toProviderField, type MapFieldsInput } from '@employ-me/core/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { STUB_CODEX, scratch, type Scratch } from '../../../test/stub-cli';
import { UNSAFE_MODEL_NAMES } from '../../../test/unsafe-models';
import { silentLogger, type LogEntry } from '../../log/logger';
import type { HelperProvider } from '../task';
import { createCodexProvider } from './provider';

const signal = new AbortController().signal;

function input(): MapFieldsInput {
  const field = toProviderField(
    {
      fieldId: 'q1',
      label: 'Will you require sponsorship?',
      control: 'radioGroup',
      options: ['Yes', 'No'],
      required: true,
    },
    'unknown',
  );
  if (!field.ok) throw new Error('fixture should be provider-safe');
  return { ats: 'ashby', fields: [field.value], savedQuestions: [] };
}

const ANSWER = JSON.stringify({
  mappings: [
    {
      fieldId: 'q1',
      kind: 'fieldType',
      fieldType: 'workAuth.sponsorship',
      savedAnswerId: null,
      options: [
        { option: 'Yes', value: 'yes' },
        { option: 'No', value: 'no' },
      ],
      confidence: 0.92,
    },
  ],
});

const recordSchema = z.union([
  z.object({
    call: z.enum(['app-server', 'mcp list']),
    argv: z.array(z.string()),
    hasOpenAiKey: z.boolean().optional(),
  }),
  z.object({
    call: z.literal('message'),
    message: z.object({
      id: z.union([z.string(), z.number()]).optional(),
      method: z.string().optional(),
      params: z.unknown().optional(),
      error: z.unknown().optional(),
    }),
  }),
]);

const open: HelperProvider[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((provider) => provider.close()));
});

function provider(
  knobs: Record<string, string>,
  extra: { timeoutMs?: number; model?: string; logs?: LogEntry[] } = {},
): { codex: HelperProvider; tmp: Scratch } {
  const tmp = scratch();
  const codex = createCodexProvider({
    platform: 'darwin',
    cliPath: STUB_CODEX,
    cwd: tmp.dir,
    env: tmp.env({ OPENAI_API_KEY: 'sk-test-not-real', ...knobs }),
    logger: extra.logs === undefined ? silentLogger : { log: (entry) => extra.logs?.push(entry) },
    ...(extra.timeoutMs === undefined ? {} : { timeoutMs: extra.timeoutMs }),
    ...(extra.model === undefined ? {} : { model: extra.model }),
  });
  open.push(codex);
  return { codex, tmp };
}

const records = (tmp: Scratch) => tmp.records().map((record) => recordSchema.parse(record));
const messages = (tmp: Scratch, method: string) =>
  records(tmp).flatMap((record) =>
    record.call === 'message' && record.message.method === method ? [record.message] : [],
  );

describe('Codex Provider', () => {
  it('maps fields through codex app-server and returns core output', async () => {
    const { codex } = provider({ STUB_OUTPUT: ANSWER });
    const result = await codex.mapFields(input(), signal);
    expect(result).toEqual({
      ok: true,
      value: {
        mappings: [
          {
            fieldId: 'q1',
            match: {
              kind: 'fieldType',
              fieldType: 'workAuth.sponsorship',
              options: [
                { option: 'Yes', value: 'yes' },
                { option: 'No', value: 'no' },
              ],
            },
            confidence: 0.92,
          },
        ],
      },
    });
  });

  it('keeps one app-server warm across requests', async () => {
    const { codex, tmp } = provider({ STUB_OUTPUT: ANSWER });
    await codex.mapFields(input(), signal);
    await codex.mapFields(input(), signal);
    expect(records(tmp).filter((record) => record.call === 'app-server')).toHaveLength(1);
    expect(messages(tmp, 'initialize')).toHaveLength(1);
    expect(messages(tmp, 'turn/start')).toHaveLength(2);
  });

  it("switches off the user's tools, plugins, skills and enabled MCP servers", async () => {
    const mcp = JSON.stringify([
      { name: 'node_repl', enabled: true },
      { name: 'old-thing', enabled: false },
    ]);
    const { codex, tmp } = provider({ STUB_OUTPUT: ANSWER, STUB_MCP: mcp });
    await codex.mapFields(input(), signal);
    const server = records(tmp).find((record) => record.call === 'app-server');
    const argv = server?.call === 'app-server' ? server.argv : [];
    for (const override of ['features.shell_tool=false', 'features.plugins=false', 'web_search="disabled"']) {
      expect(argv).toContain(override);
    }
    expect(argv).toContain('mcp_servers.node_repl.enabled=false');
    expect(argv).not.toContain('mcp_servers.old-thing.enabled=false');
    expect(server?.call === 'app-server' && server.hasOpenAiKey).toBe(false);
  });

  it('runs each task as an ephemeral read-only thread with our prompt and a per-turn outputSchema', async () => {
    const { codex, tmp } = provider({ STUB_OUTPUT: ANSWER });
    await codex.mapFields(input(), signal);
    const thread = z
      .object({ baseInstructions: z.string() })
      .loose()
      .parse(messages(tmp, 'thread/start')[0]?.params);
    expect(thread).toMatchObject({ ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never' });
    expect(thread.baseInstructions).toContain('field types');
    expect(messages(tmp, 'turn/start')[0]?.params).toMatchObject({
      effort: 'low',
      outputSchema: { type: 'object' },
    });
    // Sent after the answer, without waiting for Codex's reply.
    await expect.poll(() => messages(tmp, 'thread/unsubscribe')).toHaveLength(1);
  });

  it("uses the account's default model from Codex's catalog, not the config.toml one", async () => {
    const { codex, tmp } = provider({ STUB_OUTPUT: ANSWER });
    await codex.mapFields(input(), signal);
    expect(messages(tmp, 'thread/start')[0]?.params).toMatchObject({ model: 'stub-default' });
  });

  describe('model', () => {
    // The stub's catalog offers stub-big and stub-default, and marks stub-default the default.
    const run = async (config: string | undefined, requested: string | undefined) => {
      const logs: LogEntry[] = [];
      const { codex, tmp } = provider(
        { STUB_OUTPUT: ANSWER },
        { logs, ...(config === undefined ? {} : { model: config }) },
      );
      const result = await codex.mapFields(input(), signal, requested);
      return { result, tmp, logs, model: messages(tmp, 'thread/start')[0]?.params };
    };

    it('is the request, then config.json, then the account default', async () => {
      expect((await run('stub-default', 'stub-big')).model).toMatchObject({ model: 'stub-big' });
      expect((await run(undefined, 'stub-big')).model).toMatchObject({ model: 'stub-big' });
      expect((await run('stub-big', undefined)).model).toMatchObject({ model: 'stub-big' });
      expect((await run(undefined, undefined)).model).toMatchObject({ model: 'stub-default' });
    });

    it("falls back to the account default when the catalog doesn't offer the request's model", async () => {
      const { result, model, logs } = await run('stub-big', 'stub-missing');
      expect(result.ok).toBe(true);
      expect(model).toMatchObject({ model: 'stub-default' });
      expect(logs).toContainEqual({ event: 'provider.modelFallback', provider: 'codex' });
    });

    it("falls back to the account default when the catalog doesn't offer config.json's model", async () => {
      const { result, model, logs } = await run('stub-missing', undefined);
      expect(result.ok).toBe(true);
      expect(model).toMatchObject({ model: 'stub-default' });
      expect(logs.map((entry) => entry.event)).toContain('provider.modelFallback');
    });

    it('does not log a fallback when the model is offered', async () => {
      expect((await run(undefined, 'stub-big')).logs.map((entry) => entry.event)).not.toContain(
        'provider.modelFallback',
      );
    });

    it.each(UNSAFE_MODEL_NAMES)('refuses the requested model %j before starting Codex', async (name) => {
      const { result, tmp } = await run('stub-big', name);
      expect(result).toMatchObject({ ok: false, error: { reason: 'invalidRequest' } });
      expect(tmp.records()).toEqual([]);
    });

    it.each(UNSAFE_MODEL_NAMES)('refuses the config.json model %j before starting Codex', async (name) => {
      const { result, tmp } = await run(name, undefined);
      expect(result).toMatchObject({ ok: false, error: { reason: 'providerFailed' } });
      expect(tmp.records()).toEqual([]);
    });
  });

  it('says so when the model is not available on the plan', async () => {
    const result = await provider({ STUB_MODE: 'modelNotFound' }).codex.mapFields(input(), signal);
    expect(result).toMatchObject({ ok: false, error: { reason: 'providerFailed' } });
    expect(!result.ok && result.error.message).toMatch(/isn't available on your plan/);
  });

  it('refuses any request Codex sends back, such as a command approval', async () => {
    const { codex, tmp } = provider({ STUB_OUTPUT: ANSWER, STUB_MODE: 'askApproval' });
    expect((await codex.mapFields(input(), signal)).ok).toBe(true);
    const answer = records(tmp).find(
      (record) => record.call === 'message' && record.message.id === 'server-1',
    );
    expect(answer?.call === 'message' && answer.message.error).toBeTruthy();
  });

  it("maps Codex's usage limit to providerRateLimited", async () => {
    const result = await provider({ STUB_MODE: 'rateLimited' }).codex.mapFields(input(), signal);
    expect(result).toMatchObject({ ok: false, error: { reason: 'providerRateLimited' } });
    expect(!result.ok && result.error.fix).toMatch(/switch to Claude/);
  });

  it('interrupts a turn that takes too long', async () => {
    const { codex, tmp } = provider({ STUB_MODE: 'hang' }, { timeoutMs: 300 });
    expect(await codex.mapFields(input(), signal)).toMatchObject({
      ok: false,
      error: { reason: 'providerTimeout' },
    });
    await expect.poll(() => messages(tmp, 'turn/interrupt')).toHaveLength(1);
  });

  it('fails a request when the app-server dies, and starts a new one next time', async () => {
    const { codex, tmp } = provider({ STUB_MODE: 'crash' });
    expect(await codex.mapFields(input(), signal)).toMatchObject({
      ok: false,
      error: { reason: 'providerFailed' },
    });
    await codex.mapFields(input(), signal);
    expect(records(tmp).filter((record) => record.call === 'app-server')).toHaveLength(2);
  });

  it('reports login and remaining quota from account/rateLimits/read', async () => {
    const status = await provider({}).codex.status();
    expect(status).toMatchObject({ id: 'codex', state: 'ready', version: '0.158.0' });
    expect(status.quota).toEqual([
      { remainingPercent: 88, windowMinutes: 300, resetsAt: new Date(1793188063 * 1000).toISOString() },
      { remainingPercent: 60, windowMinutes: 10080, resetsAt: new Date(1793774863 * 1000).toISOString() },
    ]);
    expect(JSON.stringify(status)).not.toContain('sam@example.com');
  });

  it('tells the user to run `codex login` when it is logged out', async () => {
    const status = await provider({ STUB_MODE: 'notLoggedIn' }).codex.status();
    expect(status).toMatchObject({ state: 'notLoggedIn', problem: { reason: 'providerNotLoggedIn' } });
    expect(status.problem?.fix).toMatch(/codex login/);
  });

  it("won't run Codex with an MCP server it can't switch off", async () => {
    const mcp = JSON.stringify([{ name: 'my server', enabled: true }]);
    const result = await provider({ STUB_MCP: mcp }).codex.mapFields(input(), signal);
    expect(result).toMatchObject({ ok: false, error: { reason: 'providerFailed' } });
    expect(!result.ok && result.error.fix).toMatch(/"my server"/);
  });
});
