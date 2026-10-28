import {
  FIELD_TYPES,
  type CountryCode,
  type FieldType,
  type SalaryExpectation,
  type WorkAuthorization,
} from '@employ-me/core';
import type { CountryChoice } from '../classify';
import { textTarget, type OptionTarget } from '../match';
import type { ExtractedField } from '../types';
import { countryName, countryTarget } from './places';
import {
  isChoice,
  isOneOf,
  missing,
  option,
  skip,
  text,
  yesNo,
  type Answer,
  type AnswerContext,
  type CountryAnswer,
} from './types';
import { DECLINE_TARGET, vocabTarget } from './vocab';

// Answers that depend on the country: Work Authorization, salary and Self-ID
// Answers, each picked by the Posting's country. When the country is unclear
// the field goes to review with every country's answer side by side
// (design.md "Country-specific answers").

export function countryAnswer(
  fieldType: FieldType,
  field: ExtractedField,
  country: CountryChoice | undefined,
  ctx: AnswerContext,
): Answer | null {
  if (fieldType.startsWith('workAuth.'))
    return perCountry(country, ctx, (c) => workAuthAnswer(fieldType, field, c, ctx));
  if (fieldType === 'pref.salary') return perCountry(country, ctx, (c) => salaryAnswer(field, c, ctx));
  if (fieldType.startsWith('selfId.')) return selfIdAnswer(fieldType, field, country, ctx);
  return null;
}

function perCountry(
  country: CountryChoice | undefined,
  ctx: AnswerContext,
  answerFor: (country: CountryCode) => Answer,
): Answer {
  if (country?.kind === 'known') return answerFor(country.country);
  const candidates =
    country !== undefined && country.candidates.length > 0
      ? country.candidates
      : ctx.profile.countries.length > 0
        ? ctx.profile.countries
        : Object.keys(ctx.profile.workAuthorization);
  const byCountry: CountryAnswer[] = candidates.map((c) => ({ country: c, text: describe(answerFor(c)) }));
  return { kind: 'review', reason: 'countryUnclear', byCountry };
}

function describe(answer: Answer): string {
  if (answer.kind === 'answer') {
    const value = answer.value;
    switch (value.kind) {
      case 'text':
        return value.text;
      case 'yesNo':
        return value.yes ? 'Yes' : 'No';
      case 'option':
        return value.target.text;
      case 'options':
        return value.targets.map((t) => t.text).join(', ');
      case 'date':
        return value.iso;
      case 'file':
        return 'Resume';
    }
  }
  if (answer.kind === 'review') return answer.reason === 'askEachTime' ? 'Ask me each time' : 'Needs review';
  return answer.kind === 'skip' ? 'Not in your Profile' : 'Needs the AI';
}

const WORK_AUTH_TYPES = [
  'workAuth.authorized',
  'workAuth.sponsorship',
  'workAuth.status',
  'workAuth.citizenship',
  'workAuth.explanation',
  'workAuth.usPerson',
] as const satisfies readonly FieldType[];

function workAuthAnswer(
  fieldType: FieldType,
  field: ExtractedField,
  country: CountryCode,
  ctx: AnswerContext,
): Answer {
  const auth: WorkAuthorization | undefined = ctx.profile.workAuthorization[country];
  if (auth === undefined) return missing(`your Work Authorization for ${countryName(country)}`);
  if (!isOneOf(fieldType, WORK_AUTH_TYPES))
    return skip('unrecognizedField', 'Answer this Work Authorization question yourself.');
  switch (fieldType) {
    case 'workAuth.authorized':
      return yesNo(auth.authorizedNow);
    case 'workAuth.sponsorship':
      return auth.sponsorship === 'ask'
        ? { kind: 'review', reason: 'askEachTime' }
        : yesNo(auth.sponsorship === 'yes');
    case 'workAuth.status':
      return auth.status === undefined
        ? missing(`your status in ${countryName(country)}`)
        : option(textTarget(auth.status));
    case 'workAuth.citizenship': {
      if (auth.citizenships.length === 0) return missing('your citizenships');
      if (!isChoice(field)) return text(auth.citizenships.map(countryName).join(', '));
      const targets = auth.citizenships.map(countryTarget);
      return { kind: 'answer', value: { kind: 'options', targets }, source: 'rules' };
    }
    case 'workAuth.explanation':
      return auth.explanation === undefined
        ? missing('an explanation of your Work Authorization')
        : text(auth.explanation);
    case 'workAuth.usPerson':
      return auth.usPerson === undefined ? missing('whether you are a "U.S. person"') : yesNo(auth.usPerson);
  }
}

function salaryAnswer(field: ExtractedField, country: CountryCode, ctx: AnswerContext): Answer {
  const salary: SalaryExpectation | undefined = ctx.profile.preferences.salary[country];
  if (salary === undefined) return missing(`a salary expectation for ${countryName(country)}`);
  const amount = (n: number) => n.toLocaleString('en-US');
  const range =
    salary.max === undefined ? amount(salary.min) : `${amount(salary.min)} - ${amount(salary.max)}`;
  const words = `${range} ${salary.currency} per ${salary.period}`;
  return isChoice(field) ? option(salaryTarget(words, salary.min)) : text(words);
}

/** A salary-range option ("€60,000 - €70,000", "60k-70k") that contains the minimum. */
function salaryTarget(words: string, min: number): OptionTarget {
  return { text: words, patterns: [], fuzzy: false, amount: min };
}

function selfIdAnswer(
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
    return { kind: 'answer', value: { kind: 'option', target: DECLINE_TARGET }, source: 'selfId' };
  }
  const value = selfIdValue(fieldType, ctx);
  const spec = FIELD_TYPES[fieldType];
  const vocab = 'vocab' in spec ? spec.vocab : undefined;
  const target = value === undefined || vocab === undefined ? null : vocabTarget(vocab, value);
  if (target === null)
    return { kind: 'answer', value: { kind: 'option', target: DECLINE_TARGET }, source: 'selfId' };
  return { kind: 'answer', value: { kind: 'option', target }, source: 'selfId' };
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
