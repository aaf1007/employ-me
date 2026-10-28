import { describe, expect, it } from 'vitest';
import { DECLINE_TARGET, vocabTarget, yearMonthTarget, yesNoTarget } from '../answer';
import { matchOption, textTarget } from './index';

describe('matchOption', () => {
  it('matches yes and no in their many wordings', () => {
    expect(matchOption(['Yes, I am', 'No, I am not'], yesNoTarget(true))).toEqual({
      kind: 'match',
      index: 0,
    });
    expect(matchOption(['I am authorized', "I don't have authorization"], yesNoTarget(false))).toEqual({
      kind: 'match',
      index: 1,
    });
  });

  it('calls two equally good options ambiguous instead of guessing', () => {
    expect(matchOption(['No', 'Yes - Intern', 'Yes - Full Time'], yesNoTarget(true))).toMatchObject({
      kind: 'ambiguous',
      indices: [1, 2],
    });
  });

  it('finds the decline option however it is worded', () => {
    for (const decline of [
      'Decline to self-identify',
      'I don’t wish to answer',
      'Prefer not to say',
      'I do not want to answer',
    ]) {
      expect(matchOption(['Yes', 'No', decline], DECLINE_TARGET)).toEqual({ kind: 'match', index: 2 });
    }
  });

  it('maps canonical Self-ID values to the form’s words', () => {
    const race = vocabTarget('usRace', 'asian');
    if (race === null) throw new Error('no target');
    expect(matchOption(['White (Not Hispanic or Latino)', 'Asian (Not Hispanic or Latino)'], race)).toEqual({
      kind: 'match',
      index: 1,
    });
    const twoSpirit = vocabTarget('caGenderIdentity', 'twoSpirit');
    if (twoSpirit === null) throw new Error('no target');
    expect(matchOption(['Female', 'Male', 'Non-binary', 'Two-spirit'], twoSpirit)).toEqual({
      kind: 'match',
      index: 3,
    });
  });

  it('matches text by its words, and nothing when no option fits', () => {
    expect(
      matchOption(['Engineering (Computer)', 'Computer Science'], textTarget('Computer Engineering')),
    ).toEqual({
      kind: 'match',
      index: 0,
    });
    expect(matchOption(['LinkedIn', 'Indeed'], textTarget('Company website'))).toEqual({ kind: 'none' });
  });

  it('picks the salary range that holds the amount', () => {
    const target = { text: '120,000 CAD', patterns: [], amount: 120000 };
    expect(matchOption(['Under 100k', '100,000 - 130,000', '130k+'], target)).toEqual({
      kind: 'match',
      index: 1,
    });
    expect(matchOption(['Under 100k', '130k+'], target)).toEqual({ kind: 'none' });
  });

  it('never reads a graduation month as another season', () => {
    const april = yearMonthTarget('2025-04');
    expect(matchOption(['Fall 2025', 'Spring 2025'], april)).toEqual({ kind: 'match', index: 1 });
    expect(matchOption(['Fall 2025', 'Winter 2026'], april)).toEqual({ kind: 'none' });
    expect(matchOption(['2024', '2025'], april)).toEqual({ kind: 'match', index: 1 });
  });
});
