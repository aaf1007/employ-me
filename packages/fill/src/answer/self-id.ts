import { FIELD_TYPES, type CountryCode, type FieldType } from '@employ-me/core';
import type { CountryChoice } from '../classify';
import type { ExtractedField } from '../types';
import { isChoice, isOneOf, skip, type Answer, type AnswerContext } from './types';
import { withProviderOptions } from './values';
import { DECLINE_TARGET, vocabTarget } from './vocab';

// Self-ID questions fill only from your Self-ID Answers, "decline" by default
// (design.md "Sensitive questions").

const DECLINE: Answer = {
  kind: 'answer',
  value: { kind: 'option', target: DECLINE_TARGET, vocabValue: 'decline' },
  source: 'selfId',
};

export function selfIdAnswer(
  fieldType: FieldType,
  field: ExtractedField,
  country: CountryChoice | undefined,
  ctx: AnswerContext,
): Answer {
  if (!isChoice(field)) {
    return skip(
      'notInProfile',
      'employ-me fills Self-ID questions only from your Self-ID Answers. Answer it yourself, or leave it blank.',
    );
  }
  if (fieldType === 'selfId.other') {
    if (country?.kind === 'unclear') return { kind: 'review', reason: 'countryUnclear' };
    return DECLINE;
  }
  const value = selfIdValue(fieldType, ctx);
  const spec = FIELD_TYPES[fieldType];
  const vocab = 'vocab' in spec ? spec.vocab : undefined;
  const target = value === undefined || vocab === undefined ? null : vocabTarget(vocab, value);
  if (target === null || value === undefined) return DECLINE;
  return { kind: 'answer', value: { kind: 'option', target, vocabValue: value }, source: 'selfId' };
}

/**
 * A question the rules didn't see as Self-ID, and the AI says is one
 * (design.md "Sensitive questions"). The AI only says which question it is
 * and what each option means; the answer is still yours, and it always goes
 * to Needs your review. A weak match, or a question for another country
 * than the Posting's, is left for you with nothing written: misreading which
 * question it is would put your answer to one in another.
 */
export function selfIdFromMapping(
  fieldType: FieldType,
  field: ExtractedField,
  mapping: { readonly options: readonly { option: string; value: string }[]; readonly sure: boolean },
  country: CountryChoice | undefined,
  ctx: AnswerContext,
): Answer {
  // The question's country (one its words name, else the Posting's) and the
  // Posting's own must both agree with the type's.
  const fits = countryFits(fieldType, country) && countryFits(fieldType, ctx.postingCountry);
  if (!mapping.sure || !fits) return { kind: 'review', reason: 'providerMatched' };
  // The type names its country, already checked against the Posting's: selfId.other declines anywhere.
  const answer = selfIdAnswer(fieldType, field, undefined, ctx);
  if (answer.kind !== 'answer') return answer;
  return { ...answer, value: withProviderOptions(answer.value, mapping.options), review: 'providerMatched' };
}

/** A US question on a US Posting, a Canadian one on a Canadian Posting; anything when the country isn't known. */
function countryFits(fieldType: FieldType, country: CountryChoice | undefined): boolean {
  const asked = countryOfType(fieldType);
  if (asked === null || country === undefined) return true;
  if (country.kind === 'known') return country.country === asked;
  return country.candidates.length === 0 || country.candidates.includes(asked);
}

function countryOfType(fieldType: FieldType): CountryCode | null {
  if (fieldType.startsWith('selfId.us.')) return 'US';
  if (fieldType.startsWith('selfId.ca.')) return 'CA';
  return null;
}

const SELF_ID_TYPES = [
  'selfId.us.sex',
  'selfId.us.hispanicLatino',
  'selfId.us.race',
  'selfId.us.veteran',
  'selfId.us.disability',
  'selfId.ca.genderIdentity',
  'selfId.ca.indigenous',
  'selfId.ca.visibleMinority',
  'selfId.ca.disability',
] as const satisfies readonly FieldType[];

function selfIdValue(fieldType: FieldType, ctx: AnswerContext): string | undefined {
  const { US: us, CA: ca } = ctx.profile.selfId;
  if (!isOneOf(fieldType, SELF_ID_TYPES)) return undefined;
  switch (fieldType) {
    case 'selfId.us.sex':
      return us.sex;
    case 'selfId.us.hispanicLatino':
      return us.hispanicLatino;
    case 'selfId.us.race':
      return us.race;
    case 'selfId.us.veteran':
      return us.veteran;
    case 'selfId.us.disability':
      return us.disability;
    case 'selfId.ca.genderIdentity':
      return ca.genderIdentity;
    case 'selfId.ca.indigenous':
      return ca.indigenous;
    case 'selfId.ca.visibleMinority':
      return ca.visibleMinority;
    case 'selfId.ca.disability':
      return ca.disability;
  }
}
