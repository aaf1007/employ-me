import type { FieldOutcome } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { fillProgress } from './progress';

const filled: FieldOutcome = { kind: 'filled', fieldId: 'f', fieldType: 'name.first', source: 'rules' };
const review: FieldOutcome = {
  kind: 'needsReview',
  fieldId: 'r',
  fieldType: 'contact.email',
  reason: 'providerMatched',
};
const attestation: FieldOutcome = {
  kind: 'couldNotFill',
  fieldId: 'a',
  fieldType: 'attestation.other',
  reason: 'attestation',
  fix: 'Tick it yourself.',
};

const fields = (outcome: FieldOutcome | null, count: number, required = false) =>
  Array.from({ length: count }, () => ({ outcome, required }));

describe('fillProgress', () => {
  it('counts only filled fields: "Filled 18 of 22 (82%)"', () => {
    const progress = fillProgress([...fields(filled, 18), ...fields(review, 2), ...fields(attestation, 2)]);
    expect(progress).toMatchObject({ filled: 18, total: 22, percent: 82 });
  });

  it('counts fields still waiting for the AI in the total, not as filled', () => {
    expect(fillProgress([...fields(filled, 1), ...fields(null, 3)])).toMatchObject({
      filled: 1,
      total: 4,
      percent: 25,
    });
  });

  it('counts an Attestation as not filled', () => {
    const progress = fillProgress([...fields(filled, 9, true), ...fields(attestation, 1, true)]);
    expect(progress.required).toEqual({ filled: 9, total: 10 });
    expect(progress.percent).toBe(90);
  });

  it('tallies required fields apart, and has no required line when the form marks none', () => {
    const progress = fillProgress([
      ...fields(filled, 2, true),
      ...fields(review, 1, true),
      ...fields(filled, 3),
    ]);
    expect(progress).toMatchObject({ filled: 5, total: 6, required: { filled: 2, total: 3 } });
    expect(fillProgress(fields(filled, 2)).required).toBeNull();
  });

  it('says 100% only when every field is filled, and 0% only when none is', () => {
    expect(fillProgress([...fields(filled, 199), ...fields(review, 1)]).percent).toBe(99);
    expect(fillProgress([...fields(filled, 1), ...fields(review, 299)]).percent).toBe(1);
    expect(fillProgress(fields(filled, 3)).percent).toBe(100);
    expect(fillProgress([]).percent).toBe(0);
    expect(fillProgress(fields(review, 2))).toMatchObject({ filled: 0, total: 2, percent: 0 });
  });
});
