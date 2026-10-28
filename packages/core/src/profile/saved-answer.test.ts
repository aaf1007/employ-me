import { describe, expect, expectTypeOf, it } from 'vitest';
import { FIELD_TYPE_IDS, sensitivityOf, type FieldType } from '../taxonomy';
import { savedAnswerSchema, type SavedAnswer } from './saved-answer';

const base = {
  id: 's1',
  question: 'Why do you want to work here?',
  answer: 'Because.',
  createdAt: '2026-10-27T00:00:00Z',
  updatedAt: '2026-10-27T00:00:00Z',
};

type FromDraft = Extract<SavedAnswer, { source: 'draft' }>;

describe('savedAnswerSchema', () => {
  it('cannot be built from a Self-ID, Attestation or never-stored field, at the type level', () => {
    expectTypeOf<'freeText.question'>().toExtend<FromDraft['fieldType']>();
    expectTypeOf<'selfId.us.race'>().not.toExtend<FromDraft['fieldType']>();
    expectTypeOf<'selfId.ca.indigenous'>().not.toExtend<FromDraft['fieldType']>();
    expectTypeOf<'attestation.consent'>().not.toExtend<FromDraft['fieldType']>();
    expectTypeOf<'never.dateOfBirth'>().not.toExtend<FromDraft['fieldType']>();
    // An accepted Draft must say which field it came from.
    expectTypeOf<{ source: 'draft' } & typeof base>().not.toExtend<SavedAnswer>();
  });

  it.each(FIELD_TYPE_IDS.filter((t) => sensitivityOf(t) !== 'ordinary'))(
    'rejects an accepted Draft from a %s field when parsing',
    (fieldType: FieldType) => {
      expect(savedAnswerSchema.safeParse({ ...base, source: 'draft', fieldType }).success).toBe(false);
    },
  );

  it('accepts an accepted Draft from an ordinary field, and manual or imported ones without a field', () => {
    expect(
      savedAnswerSchema.parse({ ...base, source: 'draft', fieldType: 'freeText.question' }),
    ).toMatchObject({
      fieldType: 'freeText.question',
      employerOverrides: {},
    });
    expect(savedAnswerSchema.safeParse({ ...base, source: 'manual' }).success).toBe(true);
    expect(savedAnswerSchema.safeParse({ ...base, source: 'import' }).success).toBe(true);
    expect(savedAnswerSchema.safeParse({ ...base, source: 'draft' }).success).toBe(false);
  });
});
