import {
  savedAnswerSchema,
  type FieldOutcome,
  type FieldType,
  type SavedAnswer,
  type SubmittedAnswer,
} from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import type { FieldView } from '../messaging/content';
import { offeredAnswers } from './offered-answers';
import { field } from './test-fakes';

// design.md "Keeping answers you gave on the form": what the side panel
// offers to keep once an Application is created.

const couldNotFill = (
  fieldType: FieldType,
  reason: 'notInProfile' | 'unrecognizedField' | 'providerUnavailable' = 'notInProfile',
): FieldOutcome => ({
  kind: 'couldNotFill',
  fieldId: 'x',
  fieldType,
  reason,
  fix: 'Answer it yourself.',
});
const review = (fieldType: FieldType): FieldOutcome => ({
  kind: 'needsReview',
  fieldId: 'x',
  fieldType,
  reason: 'providerMatched',
});
const filled = (
  fieldType: FieldType,
  source: 'rules' | 'savedAnswer' | 'provider' = 'rules',
): FieldOutcome => ({
  kind: 'filled',
  fieldId: 'x',
  fieldType,
  source,
});

/** A field whose label is its question, and what the form showed for it. */
function asked(
  label: string,
  fieldType: FieldType,
  outcome: FieldOutcome | null,
  value: SubmittedAnswer['value'],
  extra: Partial<FieldView> = {},
): { field: FieldView; answer: SubmittedAnswer } {
  return {
    field: field(label, fieldType, outcome, { label, ...extra }),
    answer: { label, fieldType, value },
  };
}

function offer(
  items: readonly { field: FieldView; answer: SubmittedAnswer }[],
  saved: readonly SavedAnswer[] = [],
  employer: string | null = 'acme',
) {
  return offeredAnswers(
    items.map((i) => i.field),
    items.map((i) => i.answer),
    saved,
    employer,
  );
}

let n = 0;
function savedAnswer(
  question: string,
  answer: string,
  employerOverrides: Record<string, string> = {},
): SavedAnswer {
  n++;
  return savedAnswerSchema.parse({
    id: `s${n}`,
    question,
    answer,
    employerOverrides,
    source: 'manual',
    createdAt: '2026-10-30T00:00:00Z',
    updatedAt: '2026-10-30T00:00:00Z',
  });
}

describe('offeredAnswers', () => {
  it('lists fields that ended Couldn’t fill or Needs your review, or that you changed, with what you left', () => {
    const offered = offer([
      asked(
        'How did you hear about us?',
        'screening.howHeard',
        couldNotFill('screening.howHeard'),
        'LinkedIn',
      ),
      asked('Which time zone are you in?', 'unknown', review('unknown'), 'Eastern'),
      asked(
        'Tell us about a project',
        'freeText.question',
        filled('freeText.question', 'savedAnswer'),
        'Mine.',
        {
          userEdited: true,
        },
      ),
      asked('Preferred office?', 'unknown', couldNotFill('unknown', 'providerUnavailable'), ['Toronto']),
    ]);
    expect(offered.map(({ key: _key, ...rest }) => rest)).toEqual([
      {
        question: 'How did you hear about us?',
        answer: 'LinkedIn',
        fieldType: 'screening.howHeard',
      },
      {
        question: 'Which time zone are you in?',
        answer: 'Eastern',
        fieldType: 'unknown',
      },
      {
        question: 'Tell us about a project',
        answer: 'Mine.',
        fieldType: 'freeText.question',
      },
      { question: 'Preferred office?', answer: 'Toronto', fieldType: 'unknown' },
    ]);
    expect(new Set(offered.map((o) => o.key)).size).toBe(4);
  });

  it('leaves out fields the Fill filled that you didn’t change, and empty ones', () => {
    expect(
      offer([
        asked('Which time zone are you in?', 'unknown', filled('unknown', 'provider'), 'Eastern'),
        asked('Anything else?', 'unknown', couldNotFill('unknown', 'unrecognizedField'), '  '),
        asked('Languages?', 'unknown', couldNotFill('unknown', 'unrecognizedField'), []),
      ]),
    ).toEqual([]);
  });

  it('leaves out fields your Profile answers, even ones you changed: change your Profile instead', () => {
    expect(
      offer([
        asked('First name', 'name.first', filled('name.first'), 'Samuel', { userEdited: true }),
        asked('Degree', 'edu.degree', review('edu.degree'), 'Masters'),
        asked('How did you hear about us?', 'screening.howHeard', filled('screening.howHeard'), 'Referral', {
          userEdited: true,
        }),
      ]),
    ).toEqual([]);
  });

  it('never lists Self-ID, Attestation, never-stored, per-Posting, history, file or cover-letter fields', () => {
    const items = [
      asked('Race', 'selfId.us.race', review('selfId.us.race'), 'Asian'),
      asked('Which of these best describes you?', 'selfId.other', review('selfId.other'), 'Decline'),
      asked('I agree to the terms', 'attestation.consent', couldNotFill('attestation.consent'), 'Yes'),
      asked('SIN', 'never.governmentId', couldNotFill('never.governmentId'), '123'),
      asked(
        'Do you require sponsorship?',
        'workAuth.sponsorship',
        couldNotFill('workAuth.sponsorship'),
        'No',
      ),
      asked('Desired salary', 'pref.salary', couldNotFill('pref.salary'), '120k'),
      asked(
        'Worked here before?',
        'screening.workedHereBefore',
        couldNotFill('screening.workedHereBefore'),
        'No',
      ),
      asked('Role Description', 'work.description', couldNotFill('work.description'), 'Built things.'),
      asked('Resume', 'file.resume', couldNotFill('file.resume'), 'sam.pdf'),
      asked('Cover letter', 'freeText.coverLetter', couldNotFill('freeText.coverLetter'), 'Dear Acme'),
      // An ordinary field whose question reads like a Self-ID one.
      asked('Are you a protected veteran?', 'unknown', couldNotFill('unknown', 'unrecognizedField'), 'No'),
    ];
    expect(offer(items.map((i) => ({ ...i, field: { ...i.field, userEdited: true } })))).toEqual([]);
  });

  it('leaves out questions with several options ticked, and single checkboxes', () => {
    expect(
      offer([
        asked('Which offices?', 'unknown', review('unknown'), ['Toronto', 'Montreal']),
        asked('Join our talent community', 'unknown', review('unknown'), true),
      ]),
    ).toEqual([]);
  });

  it('skips a question that already has the same Saved Answer, for this employer', () => {
    const items = [asked('Which time zone are you in?', 'unknown', review('unknown'), 'Eastern')];
    expect(offer(items, [savedAnswer('which time zone are you in', 'Eastern')])).toEqual([]);
    expect(
      offer(items, [savedAnswer('Which time zone are you in?', 'Pacific', { acme: 'Eastern' })]),
    ).toEqual([]);
  });

  it('shows a changed answer as an update, with the answer it replaces', () => {
    const items = [asked('Which time zone are you in?', 'unknown', review('unknown'), 'Eastern')];
    expect(offer(items, [savedAnswer('Which time zone are you in?', 'Pacific')])).toEqual([
      expect.objectContaining({ answer: 'Eastern', previous: 'Pacific' }),
    ]);
    expect(
      offer(items, [savedAnswer('Which time zone are you in?', 'Eastern', { acme: 'Central' })]),
    ).toEqual([expect.objectContaining({ answer: 'Eastern', previous: 'Central' })]);
    expect(
      offer(items, [savedAnswer('Which time zone are you in?', 'Eastern', { other: 'Central' })], 'other'),
    ).toEqual([expect.objectContaining({ previous: 'Central' })]);
  });

  it('lists a question asked on two steps once, with the later answer', () => {
    expect(
      offer([
        asked('Which time zone are you in?', 'unknown', review('unknown'), 'Pacific'),
        asked('Which time zone are you in?', 'unknown', review('unknown'), 'Eastern'),
      ]),
    ).toEqual([expect.objectContaining({ answer: 'Eastern' })]);
  });
});
