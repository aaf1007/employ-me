import {
  toProviderField,
  type FieldDescriptor,
  type MapFieldsInput,
  type ProviderField,
} from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
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
          { fieldId: 'q1', match: { kind: 'needsDraft' } },
          { fieldId: 'q2', match: { kind: 'unknown' } },
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

describe('selectProvider', () => {
  it('uses the fake when EMPLOY_ME_PROVIDER=fake, even with no CLI installed', () => {
    expect(selectProvider('claude', {}, { EMPLOY_ME_PROVIDER: 'fake' })?.isFake).toBe(true);
  });

  it('passes EMPLOY_ME_FAKE_FAIL through to the fake', async () => {
    const provider = selectProvider(
      'codex',
      {},
      { EMPLOY_ME_PROVIDER: 'fake', EMPLOY_ME_FAKE_FAIL: 'providerTimeout' },
    );
    const result = await provider?.mapFields(input, signal);
    expect(result).toMatchObject({ ok: false, error: { reason: 'providerTimeout' } });
  });

  it('uses the real CLI otherwise, and nothing when it was not found', () => {
    expect(selectProvider('claude', { claude: '/usr/local/bin/claude' }, {})?.isFake).toBe(false);
    expect(selectProvider('codex', {}, {})).toBeNull();
  });
});
