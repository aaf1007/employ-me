import { describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '../fields/descriptor';
import { profileSchema } from '../profile/profile';
import { helperRequestSchema } from '../protocol/messages';
import { FIELD_TYPE_IDS, sensitivityOf } from '../taxonomy';
import {
  mapFieldsInputSchema,
  toDraftContext,
  toProviderField,
  type MapFieldsInput,
  type ProviderField,
} from './boundary';

const field: FieldDescriptor = {
  fieldId: 'question_123',
  label: 'Why do you want to work here?',
  control: 'textarea',
  options: [],
  required: true,
};

// A Profile full of sentinel values that must never reach a Provider.
const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' }, preferredName: { first: 'Sammy' } },
  contact: {
    email: 'SENTINEL-EMAIL@example.com',
    phone: { countryCode: '+1', number: '5550100', type: 'mobile' },
  },
  address: { line1: 'SENTINEL-STREET', city: 'Toronto', country: 'CA' },
  workAuthorization: { US: { authorizedNow: false, sponsorship: 'ask', status: 'SENTINEL-STATUS' } },
  selfId: { US: { race: 'asian', veteran: 'protectedVeteran' }, CA: { visibleMinority: 'yes' } },
  screening: { howHeard: 'SENTINEL-HOWHEARD', nonCompete: true },
  preferences: { salary: { CA: { currency: 'CAD', min: 123456, period: 'year' } } },
  background: {
    workHistory: [{ id: 'w1', employer: 'Acme', title: 'Engineer', startDate: '2024-01' }],
    skills: [{ name: 'TypeScript' }],
  },
  savedAnswers: [
    {
      id: 's1',
      question: 'Why us?',
      answer: 'Generic answer',
      employerOverrides: { acme: 'Acme answer' },
      source: 'manual',
      createdAt: '2026-10-27T00:00:00Z',
      updatedAt: '2026-10-27T00:00:00Z',
    },
  ],
});

describe('toProviderField', () => {
  const sensitive = FIELD_TYPE_IDS.filter((t) => sensitivityOf(t) !== 'ordinary');

  it.each(sensitive)('refuses fields the rules classified as %s', (fieldType) => {
    const result = toProviderField(field, fieldType);
    expect(result).toEqual({
      ok: false,
      error: { reason: 'sensitiveField', fieldId: field.fieldId, fieldType },
    });
  });

  it('sends labels and options only, dropping anything else on the runtime object', () => {
    const rich = { ...field, value: 'SENTINEL-VALUE', element: { tagName: 'TEXTAREA' } };
    const result = toProviderField(rich, 'unknown');
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
    expect(JSON.stringify(result)).not.toContain('element');
  });
});

describe('mapFieldsInputSchema', () => {
  it('rejects a field carrying a value', () => {
    const input = { ats: 'greenhouse', fields: [{ ...field, value: 'x' }], savedQuestions: [] };
    expect(mapFieldsInputSchema.safeParse(input).success).toBe(false);
  });

  it('cannot be built from plain objects at compile time', () => {
    const plain = { ...field };
    // @ts-expect-error ProviderField is branded: use toProviderField.
    const forged: ProviderField = plain;
    // @ts-expect-error MapFieldsInput needs branded fields.
    const input: MapFieldsInput = { ats: 'greenhouse', fields: [plain], savedQuestions: [] };
    expect([forged, input]).toHaveLength(2);
  });
});

describe('toDraftContext', () => {
  const request = {
    question: { label: 'Why us?', required: true },
    mode: 'write',
    posting: { title: 'Engineer', company: 'Acme', description: 'Build things.' },
    employer: 'acme',
  } as const;

  it('copies only whitelisted facts out of a full Profile', () => {
    const result = toDraftContext(profile, request);
    expect(result.ok).toBe(true);
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/SENTINEL|selfId|asian|protectedVeteran|workAuthorization|123456|nonCompete/);
    expect(json).toContain('Sammy Lee');
    expect(json).toContain('TypeScript');
  });

  it('uses the employer override of a Saved Answer', () => {
    const result = toDraftContext(profile, request);
    expect(result.ok && result.value.savedAnswers).toEqual([{ question: 'Why us?', answer: 'Acme answer' }]);
  });

  it('needs your own draft in polish mode', () => {
    expect(toDraftContext(profile, { ...request, mode: 'polish' }).ok).toBe(false);
  });
});

describe('helperRequestSchema', () => {
  it('rejects a draftAnswer request smuggling Self-ID Answers', () => {
    const context = toDraftContext(profile, {
      question: { label: 'Why us?', required: true },
      mode: 'write',
      posting: {},
    });
    if (!context.ok) throw new Error('fixture should build');
    const smuggled = { ...context.value, facts: { ...context.value.facts, selfId: profile.selfId } };
    const request = { v: 1, id: 'r1', type: 'draftAnswer', provider: 'claude', input: smuggled };
    expect(helperRequestSchema.safeParse(request).success).toBe(false);
  });
});
