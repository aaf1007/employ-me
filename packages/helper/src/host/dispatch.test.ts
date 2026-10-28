import { PROTOCOL_VERSION, toProviderField, type HelperResponse } from '@employ-me/core/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { STUB_CLAUDE, STUB_CODEX, scratch, type Scratch } from '../../test/stub-cli';
import { UNSAFE_MODEL_NAMES } from '../../test/unsafe-models';
import { silentLogger } from '../log/logger';
import { createProviderRegistry, selectProvider, type ProviderRegistry } from '../providers/select';
import { dispatch } from './dispatch';

// The request path end to end, from a Native Messaging request to the stub
// CLI's argv, with the real Provider selection (no fake) and config.json's models.

function emailField() {
  const field = toProviderField(
    { fieldId: 'q1', label: 'Email address', control: 'email', options: [], required: true },
    'unknown',
  );
  if (!field.ok) throw new Error('fixture should be provider-safe');
  return field.value;
}

const CLAUDE_ANSWER = JSON.stringify({
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
});

function request(provider: 'claude' | 'codex', model?: string) {
  return {
    v: PROTOCOL_VERSION,
    id: 'r1',
    type: 'mapFields',
    provider,
    ...(model === undefined ? {} : { model }),
    input: { ats: 'lever', fields: [emailField()], savedQuestions: [] },
  };
}

const open: ProviderRegistry[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((providers) => providers.close()));
});

function host(models: { claude?: string; codex?: string } = {}) {
  const tmp = scratch();
  const env = tmp.env({ STUB_OUTPUT: CLAUDE_ANSWER });
  const providers = createProviderRegistry((id) =>
    selectProvider(id, { claude: STUB_CLAUDE, codex: STUB_CODEX }, env, {
      platform: 'darwin',
      workDir: tmp.dir,
      logger: silentLogger,
      models,
    }),
  );
  open.push(providers);
  const send = (raw: unknown): Promise<HelperResponse> =>
    dispatch(
      raw,
      0,
      { providers, logger: silentLogger, health: () => Promise.reject(new Error('unused')) },
      new AbortController().signal,
    );
  return { send, tmp };
}

const claudeModel = (tmp: Scratch) => {
  const { argv } = z.object({ argv: z.array(z.string()) }).parse(tmp.records()[0]);
  return argv[argv.indexOf('--model') + 1];
};

const threadStart = z.object({
  call: z.literal('message'),
  message: z.object({
    method: z.literal('thread/start'),
    params: z.object({ model: z.string().nullable() }),
  }),
});
const codexModel = (tmp: Scratch) =>
  tmp.records().flatMap((record) => {
    const parsed = threadStart.safeParse(record);
    return parsed.success ? [parsed.data.message.params.model] : [];
  })[0];

describe('a request that names a model', () => {
  it('runs Claude on it, over config.json, which is over Sonnet', async () => {
    const named = host({ claude: 'haiku' });
    expect((await named.send(request('claude', 'claude-opus-4-5'))).ok).toBe(true);
    expect(claudeModel(named.tmp)).toBe('claude-opus-4-5');

    const configured = host({ claude: 'haiku' });
    expect((await configured.send(request('claude'))).ok).toBe(true);
    expect(claudeModel(configured.tmp)).toBe('haiku');

    const unset = host();
    expect((await unset.send(request('claude'))).ok).toBe(true);
    expect(claudeModel(unset.tmp)).toBe('sonnet');
  });

  it('runs Codex on it when the account offers it', async () => {
    const { send, tmp } = host({ codex: 'stub-default' });
    await send(request('codex', 'stub-big'));
    expect(codexModel(tmp)).toBe('stub-big');
  });

  it.each(UNSAFE_MODEL_NAMES)('is refused when it is %j, and no CLI runs', async (name) => {
    const { send, tmp } = host();
    const response = await send(request('claude', name));
    expect(response).toMatchObject({ ok: false, error: { reason: 'invalidRequest' } });
    expect(!response.ok && response.error.message).toMatch(/model name/);
    expect(tmp.records()).toEqual([]);
  });
});
