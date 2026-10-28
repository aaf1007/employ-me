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
