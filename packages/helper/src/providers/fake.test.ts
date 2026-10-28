import {
  toDraftContext,
  toProviderField,
  type FieldDescriptor,
  type MapFieldsInput,
  type ProviderField,
} from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../log/logger';
import { createFakeProvider } from './fake';
import { selectProvider } from './select';

const signal = new AbortController().signal;

function providerField(descriptor: FieldDescriptor): ProviderField {
  const result = toProviderField(descriptor, 'unknown');
  if (!result.ok) throw new Error('fixture should be provider-safe');
  return result.value;
}

const input: MapFieldsInput = {
  ats: 'greenhouse',
  fields: [
    providerField({ fieldId: 'q1', label: 'Why us?', control: 'textarea', options: [], required: true }),
    providerField({
      fieldId: 'q2',
      label: 'Favourite colour',
      control: 'select',
      options: ['Red'],
      required: false,
    }),
  ],
  savedQuestions: [],
};

describe('fake provider', () => {
  it('maps textareas to needsDraft and everything else to unknown', async () => {
    const result = await createFakeProvider('claude').mapFields(input, signal);
    expect(result).toEqual({
      ok: true,
      value: {
        mappings: [
          { fieldId: 'q1', match: { kind: 'needsDraft' }, confidence: 1 },
          { fieldId: 'q2', match: { kind: 'unknown' }, confidence: 0 },
        ],
      },
    });
  });

  it('refuses inputs outside the boundary schema', async () => {
    const smuggled = { ...input, selfId: { US: { race: 'asian' } } } as unknown as MapFieldsInput;
    const result = await createFakeProvider('codex').mapFields(smuggled, signal);
    expect(result).toMatchObject({ ok: false, error: { reason: 'boundaryViolation' } });
  });

  it('can simulate an unavailable Provider', async () => {
    const result = await createFakeProvider('claude', { failWith: 'providerRateLimited' }).mapFields(
      input,
      signal,
    );
    expect(result).toMatchObject({ ok: false, error: { reason: 'providerRateLimited' } });
  });
});

describe('fake provider Drafts', () => {
  const draftContext = (mode: 'write' | 'polish', userDraft?: string) => {
    const context = toDraftContext(
      {
        links: {},
        background: { workHistory: [], education: [], skills: [], languages: [] },
        savedAnswers: [],
      },
      {
        question: { label: 'Why us?', required: true },
        mode,
        ...(userDraft === undefined ? {} : { userDraft }),
        posting: {},
      },
    );
    if (!context.ok) throw new Error('fixture should build');
    return context.value;
  };

  it('writes a Draft with one unsupported claim, so tests see it flagged', async () => {
    const result = await createFakeProvider('claude').draftAnswer(draftContext('write'), signal);
    expect(result).toMatchObject({
      ok: true,
      value: { draft: { claims: [{ support: 'unsupported' }] } },
    });
  });

  it('polishes your own text in polish mode', async () => {
    const result = await createFakeProvider('codex').draftAnswer(
      draftContext('polish', 'I like it.'),
      signal,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { draft: { text: 'I like it. (polished)', claims: [{ support: 'userDraft' }] } },
    });
  });
});

describe('selectProvider', () => {
  const context = { platform: 'darwin', workDir: '/tmp', logger: silentLogger } as const;

  it('uses the fake when EMPLOY_ME_PROVIDER=fake, even with no CLI installed', () => {
    expect(selectProvider('claude', {}, { EMPLOY_ME_PROVIDER: 'fake' }, context)?.isFake).toBe(true);
  });

  it('passes EMPLOY_ME_FAKE_FAIL through to the fake', async () => {
    const provider = selectProvider(
      'codex',
      {},
      { EMPLOY_ME_PROVIDER: 'fake', EMPLOY_ME_FAKE_FAIL: 'providerTimeout' },
      context,
    );
    const result = await provider?.mapFields(input, signal);
    expect(result).toMatchObject({ ok: false, error: { reason: 'providerTimeout' } });
  });

  it('uses the real CLI otherwise, and nothing when it was not found', () => {
    expect(selectProvider('claude', { claude: '/usr/local/bin/claude' }, {}, context)?.isFake).toBe(false);
    expect(selectProvider('codex', {}, {}, context)).toBeNull();
  });
});
