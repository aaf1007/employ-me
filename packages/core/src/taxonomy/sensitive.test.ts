import { describe, expect, it } from 'vitest';
import { sensitiveQuestion } from './sensitive';

describe('Attestations versus willingness questions', () => {
  it('a question about a background check is a fact you answer', () => {
    expect(sensitiveQuestion('Will you consent to a background check?')).toBeNull();
    expect(sensitiveQuestion('Do you consent to a drug screen?')).toBeNull();
  });

  // Live, 1Password (Ashby), 2026-10-28: a statement to tick was filled from the Profile.
  it('a statement about one is yours to affirm', () => {
    expect(
      sensitiveQuestion(
        'I understand that 1Password offers of employment are conditional on satisfactory completion of a background check.',
      ),
    ).toEqual({ kind: 'fieldType', fieldType: 'attestation.other' });
    expect(sensitiveQuestion('I consent to a background check')).toEqual({
      kind: 'fieldType',
      fieldType: 'attestation.consent',
    });
    expect(sensitiveQuestion('By checking this box, I agree to a background check')).toEqual({
      kind: 'fieldType',
      fieldType: 'attestation.other',
    });
  });

  // Live, 1Password (Ashby), 2026-10-28: a mailing-list sign-up went to the AI as an unknown question.
  it('a mailing-list sign-up is consent', () => {
    expect(
      sensitiveQuestion(
        'Interested in learning more about exciting careers at 1Password? Check this box to sign up. You can unsubscribe at any time.',
      ),
    ).toEqual({ kind: 'fieldType', fieldType: 'attestation.consent' });
  });
});
