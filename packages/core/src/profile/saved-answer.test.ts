import { describe, expect, expectTypeOf, it } from 'vitest';
import { FIELD_TYPE_IDS, sensitivityOf, type FieldType } from '../taxonomy';
import {
  HISTORY_FIELD_TYPES,
  PER_POSTING_FIELD_TYPES,
  SENSITIVE_QUESTION_MESSAGE,
  formAnswerSchema,
  savedAnswerSchema,
  type FormAnswerFieldType,
  type SavedAnswer,
} from './saved-answer';

const base = {
  id: 's1',
  question: 'Why do you want to work here?',
  answer: 'Because.',
  createdAt: '2026-10-27T00:00:00Z',
  updatedAt: '2026-10-27T00:00:00Z',
};

type FromDraft = Extract<SavedAnswer, { source: 'draft' }>;
type FromForm = Extract<SavedAnswer, { source: 'form' }>;

const NOT_KEPT_FROM_A_FORM = [
  ...PER_POSTING_FIELD_TYPES,
  ...HISTORY_FIELD_TYPES,
  'file.resume',
  'file.coverLetter',
  'freeText.coverLetter',
] as const;

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

  it('keeps an answer you gave on a form, with its ordinary field type, at the type level', () => {
    expectTypeOf<'unknown'>().toExtend<FromForm['fieldType']>();
    expectTypeOf<'screening.howHeard'>().toExtend<FromForm['fieldType']>();
    expectTypeOf<FormAnswerFieldType>().toEqualTypeOf<FromForm['fieldType']>();
    expectTypeOf<'selfId.us.race'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'attestation.consent'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'never.governmentId'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'file.resume'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'freeText.coverLetter'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'workAuth.sponsorship'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'pref.salary'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'screening.workedHereBefore'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'work.description'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<'edu.school'>().not.toExtend<FromForm['fieldType']>();
    expectTypeOf<{ source: 'form' } & typeof base>().not.toExtend<SavedAnswer>();
  });

  it('accepts an answer from a form field the Fill could ask again', () => {
    expect(
      savedAnswerSchema.parse({
        ...base,
        question: 'How did you hear about us?',
        answer: 'LinkedIn',
        source: 'form',
        fieldType: 'screening.howHeard',
      }),
    ).toMatchObject({ source: 'form', fieldType: 'screening.howHeard', employerOverrides: {} });
    expect(savedAnswerSchema.safeParse({ ...base, source: 'form', fieldType: 'unknown' }).success).toBe(true);
    expect(savedAnswerSchema.safeParse({ ...base, source: 'form' }).success).toBe(false);
  });

  // design.md "Keeping answers you gave on the form": never offered.
  it.each([...FIELD_TYPE_IDS.filter((t) => sensitivityOf(t) !== 'ordinary'), ...NOT_KEPT_FROM_A_FORM])(
    'rejects an answer from a %s field on a form',
    (fieldType: FieldType) => {
      expect(savedAnswerSchema.safeParse({ ...base, source: 'form', fieldType }).success).toBe(false);
      expect(formAnswerSchema.safeParse({ question: base.question, answer: 'x', fieldType }).success).toBe(
        false,
      );
    },
  );

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
    expect(
      savedAnswerSchema.safeParse({ ...base, question, source: 'form', fieldType: 'unknown' }).success,
    ).toBe(false);
    expect(formAnswerSchema.safeParse({ question, answer: 'x', fieldType: 'unknown' }).success).toBe(false);
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

describe('PER_POSTING_FIELD_TYPES', () => {
  it('lists every Work Authorization type, salary, and worked here before', () => {
    expect([...PER_POSTING_FIELD_TYPES].sort()).toEqual(
      [
        ...FIELD_TYPE_IDS.filter((t) => t.startsWith('workAuth.')),
        'pref.salary',
        'screening.workedHereBefore',
      ].sort(),
    );
  });
});

describe('HISTORY_FIELD_TYPES', () => {
  it('lists every work history and education type', () => {
    expect([...HISTORY_FIELD_TYPES].sort()).toEqual(
      FIELD_TYPE_IDS.filter((t) => t.startsWith('work.') || t.startsWith('edu.')).sort(),
    );
  });
});

describe('formAnswerSchema', () => {
  it('is a question, the answer left in the form, and the field type', () => {
    expect(
      formAnswerSchema.parse({ question: ' Ever worked here before? ', answer: 'No', fieldType: 'unknown' }),
    ).toEqual({ question: 'Ever worked here before?', answer: 'No', fieldType: 'unknown' });
  });

  it('refuses an empty answer or question, and unknown keys', () => {
    expect(formAnswerSchema.safeParse({ question: 'Q?', answer: '  ', fieldType: 'unknown' }).success).toBe(
      false,
    );
    expect(formAnswerSchema.safeParse({ question: ' ', answer: 'A', fieldType: 'unknown' }).success).toBe(
      false,
    );
    expect(
      formAnswerSchema.safeParse({ question: 'Q?', answer: 'A', fieldType: 'unknown', value: 'A' }).success,
    ).toBe(false);
  });
});
