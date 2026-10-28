import { describe, expect, expectTypeOf, it } from 'vitest';
import { FIELD_TYPE_IDS, sensitivityOf, type FieldType } from '../taxonomy';
import { SENSITIVE_QUESTION_MESSAGE, savedAnswerSchema, type SavedAnswer } from './saved-answer';

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

  // design.md "Sensitive questions" and "Never stored": however a Saved
  // Answer is made (typed in, imported, restored, read back), these
  // questions are refused, so their answers can never reach a Provider.
  it.each([
    'What is your gender?',
    'Are you Hispanic or Latino?',
    'Please identify your race',
    'Veteran status',
    'Do you have a disability?',
    'Do you identify as an Indigenous person?',
    'What are your pronouns?',
    'Social Security Number (SSN)',
    'What is your SIN?',
    'Social insurance number',
    'Password',
    'Confirm your password',
    'Date of birth',
    'DOB',
    'Please list two professional references',
    'I certify that the information above is true and complete',
    'Signature',
    'I consent to the processing of my personal data',
  ])('refuses the sensitive question %j, whatever its source', (question) => {
    for (const source of ['manual', 'import'] as const) {
      const parsed = savedAnswerSchema.safeParse({ ...base, question, source });
      expect(parsed.success, `${source}: ${question}`).toBe(false);
      expect(parsed.error?.issues).toEqual([
        expect.objectContaining({ path: ['question'], message: SENSITIVE_QUESTION_MESSAGE }),
      ]);
    }
    expect(
      savedAnswerSchema.safeParse({ ...base, question, source: 'draft', fieldType: 'freeText.question' })
        .success,
    ).toBe(false);
  });

  it('keeps questions about facts and willingness', () => {
    for (const question of [
      'Why do you want to work here?',
      'Will you consent to a background check?',
      'Describe a project you are proud of',
    ]) {
      expect(savedAnswerSchema.safeParse({ ...base, question, source: 'manual' }).success, question).toBe(
        true,
      );
    }
  });
});
