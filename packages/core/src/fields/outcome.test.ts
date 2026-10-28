import { describe, expect, it } from 'vitest';
import { fieldOutcomeSchema } from './outcome';

describe('FieldOutcome', () => {
  it('has a review reason for a field the user changed after a Fill', () => {
    expect(
      fieldOutcomeSchema.parse({
        kind: 'needsReview',
        fieldId: 'q1',
        fieldType: 'contact.email',
        reason: 'keptYourEdit',
      }),
    ).toMatchObject({ reason: 'keptYourEdit' });
  });

  // Live, 2026-10-28: a Draft Codex couldn't write said "The AI is unavailable", though Codex had mapped the form.
  it('tells a failed Draft apart from an unavailable Provider', () => {
    expect(
      fieldOutcomeSchema.parse({
        kind: 'couldNotFill',
        fieldId: 'q1',
        fieldType: 'freeText.question',
        reason: 'draftFailed',
        fix: 'Click Draft to try again.',
      }),
    ).toMatchObject({ reason: 'draftFailed' });
  });

  // Live, Zoox (Lever), 2026-10-28: "list any countries of which you are a citizen …, and when you obtained such status".
  it('has a review reason for an answer that covers only part of the question', () => {
    expect(
      fieldOutcomeSchema.parse({
        kind: 'needsReview',
        fieldId: 'q1',
        fieldType: 'workAuth.citizenship',
        reason: 'asksForMore',
      }),
    ).toMatchObject({ reason: 'asksForMore' });
  });

  it('refuses a "Couldn\'t fill" without a fix', () => {
    expect(
      fieldOutcomeSchema.safeParse({
        kind: 'couldNotFill',
        fieldId: 'q1',
        fieldType: 'unknown',
        reason: 'unrecognizedField',
        fix: '',
      }).success,
    ).toBe(false);
  });
});
