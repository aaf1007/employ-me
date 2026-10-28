import { toProviderField, type MapFieldsInput } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { STUB_CLAUDE, scratch } from '../../../test/stub-cli';
import { silentLogger } from '../../log/logger';
import { createClaudeProvider } from './provider';

const signal = new AbortController().signal;
const LABEL = 'Email address (SENTINEL-LABEL)';

function input(): MapFieldsInput {
  const field = toProviderField(
    { fieldId: 'q1', label: LABEL, control: 'email', options: [], required: true },
    'unknown',
  );
  if (!field.ok) throw new Error('fixture should be provider-safe');
  return { ats: 'lever', fields: [field.value], savedQuestions: [] };
}

const ANSWER = {
  mappings: [
    {
      fieldId: 'q1',
      kind: 'fieldType',
      fieldType: 'contact.email',
      savedAnswerId: null,
      options: [],
      confidence: 0.97,
    },
  ],
};

function provider(knobs: Record<string, string>, extra: { cliPath?: string; timeoutMs?: number } = {}) {
  const tmp = scratch();
  const claude = createClaudeProvider({
    platform: 'darwin',
    cliPath: extra.cliPath ?? STUB_CLAUDE,
    cwd: tmp.dir,
    env: tmp.env({ ANTHROPIC_API_KEY: 'sk-ant-test-not-real', ...knobs }),
    logger: silentLogger,
    ...(extra.timeoutMs === undefined ? {} : { timeoutMs: extra.timeoutMs }),
  });
  return { claude, tmp };
}

const recordSchema = z.object({ argv: z.array(z.string()), stdin: z.string(), hasApiKey: z.boolean() });
const firstRecord = (tmp: ReturnType<typeof scratch>) => recordSchema.parse(tmp.records()[0]);

describe('Claude Provider', () => {
  it('maps fields through `claude -p` and returns core output', async () => {
    const { claude } = provider({ STUB_OUTPUT: JSON.stringify(ANSWER) });
    expect(await claude.mapFields(input(), signal)).toEqual({
      ok: true,
      value: {
        mappings: [
          {
            fieldId: 'q1',
            match: { kind: 'fieldType', fieldType: 'contact.email', options: [] },
            confidence: 0.97,
          },
        ],
      },
    });
  });

  it("runs the stock CLI with the user's tools, MCP, settings and commands off (ADR-0002)", async () => {
    const { claude, tmp } = provider({ STUB_OUTPUT: JSON.stringify(ANSWER) });
    await claude.mapFields(input(), signal);
    const argv = firstRecord(tmp).argv;
    expect(argv).toEqual(expect.arrayContaining(['-p', '--strict-mcp-config', '--disable-slash-commands']));
    expect(argv).toEqual(
      expect.arrayContaining(['--no-session-persistence', '--json-schema', '--system-prompt']),
    );
    expect(argv[argv.indexOf('--output-format') + 1]).toBe('json');
    expect(argv[argv.indexOf('--tools') + 1]).toBe('');
    expect(argv[argv.indexOf('--setting-sources') + 1]).toBe('');
    expect(argv[argv.indexOf('--model') + 1]).toBe('sonnet');
  });

  it('strips ANTHROPIC_API_KEY so the plan is used, and sends the request on stdin, not argv', async () => {
    const { claude, tmp } = provider({ STUB_OUTPUT: JSON.stringify(ANSWER) });
    await claude.mapFields(input(), signal);
    const record = firstRecord(tmp);
    expect(record.hasApiKey).toBe(false);
    expect(record.stdin).toContain('SENTINEL-LABEL');
    expect(record.argv.join(' ')).not.toContain('SENTINEL-LABEL');
  });

  it.each([
    ['notLoggedIn', 'providerNotLoggedIn', /run `claude` in a terminal/],
    ['rateLimited', 'providerRateLimited', /switch to Codex/],
    ['garbage', 'providerFailed', /doctor/],
    ['noStructuredOutput', 'invalidProviderOutput', /Retry/],
  ])('maps a %s run to %s with a fix', async (mode, reason, fix) => {
    const { claude } = provider({ STUB_MODE: mode });
    const result = await claude.mapFields(input(), signal);
    expect(result).toMatchObject({ ok: false, error: { reason } });
    expect(!result.ok && result.error.fix).toMatch(fix);
  });

  it('reports a missing CLI as providerNotFound', async () => {
    const { claude } = provider({}, { cliPath: '/nonexistent/claude' });
    expect(await claude.mapFields(input(), signal)).toMatchObject({
      ok: false,
      error: { reason: 'providerNotFound' },
    });
  });

  it('kills a CLI that takes too long and says so', async () => {
    const { claude } = provider({ STUB_MODE: 'hang' }, { timeoutMs: 300 });
    expect(await claude.mapFields(input(), signal)).toMatchObject({
      ok: false,
      error: { reason: 'providerTimeout' },
    });
  });

  it('turns output in the wrong shape into invalidProviderOutput', async () => {
    const { claude } = provider({ STUB_OUTPUT: JSON.stringify({ nope: true }) });
    expect(await claude.mapFields(input(), signal)).toMatchObject({
      ok: false,
      error: { reason: 'invalidProviderOutput' },
    });
  });

  it('asks the CLI whether it is logged in, and reads nothing else', async () => {
    expect(await provider({}).claude.status()).toMatchObject({
      id: 'claude',
      state: 'ready',
      version: '2.1.311',
    });
    const status = await provider({ STUB_MODE: 'notLoggedIn' }).claude.status();
    expect(status).toMatchObject({ state: 'notLoggedIn', problem: { reason: 'providerNotLoggedIn' } });
    expect(JSON.stringify(status)).not.toContain('sam@example.com');
  });
});
