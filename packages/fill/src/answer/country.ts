import {
  normalizeLabel,
  type CountryCode,
  type FieldType,
  type SalaryExpectation,
  type WorkAuthorization,
} from '@employ-me/core';
import type { CountryChoice } from '../classify';
import { textTarget, type OptionTarget } from '../match';
import type { ExtractedField } from '../types';
import { exportControlAnswer } from './export-control';
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
import { selfIdAnswer } from './self-id';

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
      if (!isChoice(field)) return citizenshipText(auth.citizenships, field);
      const targets = auth.citizenships.map(countryTarget);
      return { kind: 'answer', value: { kind: 'options', targets }, source: 'rules' };
    }
    case 'workAuth.explanation':
      return auth.explanation === undefined
        ? missing('an explanation of your Work Authorization')
        : text(auth.explanation);
    case 'workAuth.usPerson':
      return exportControlAnswer(field, auth, ctx.profile);
  }
}

/** Your citizenships, flagged when the box also asks for permanent residencies or dates the Profile doesn't hold. */
function citizenshipText(citizenships: readonly CountryCode[], field: ExtractedField): Answer {
  const asksMore =
    /\bpermanent resident\w*\b|\bresidenc\w*\b|\bwhen\b|\bdates?\b|\bsince\b|\bobtained\b/.test(
      normalizeLabel(field.label),
    );
  return {
    kind: 'answer',
    value: { kind: 'text', text: citizenships.map(countryName).join(', ') },
    source: 'rules',
    ...(asksMore ? { review: 'asksForMore' } : {}),
  };
}

function salaryAnswer(field: ExtractedField, country: CountryCode, ctx: AnswerContext): Answer {
  const salary: SalaryExpectation | undefined = ctx.profile.preferences.salary[country];
  if (salary === undefined) return missing(`a salary expectation for ${countryName(country)}`);
  const amount = (n: number) => n.toLocaleString('en-US');
  const range =
    salary.max === undefined ? amount(salary.min) : `${amount(salary.min)} - ${amount(salary.max)}`;
  const words = `${range} ${salary.currency} per ${salary.period}`;
  if (isChoice(field)) return option(salaryTarget(words, salary.min));
  // A box for one end of the range, or for "a number", gets just that number.
  const label = normalizeLabel(field.label);
  const end =
    /\b(end|maximum|max|upper|top)\b/.test(label) &&
    !/\b(beginning|start|minimum|min|lower|bottom)\b/.test(label);
  const one =
    end ||
    field.control === 'number' ||
    /\b(beginning|start|minimum|min|lower|bottom)\b|\ba number\b|\bnumbers? only\b|\bnumeric\b/.test(label);
  if (!one) return text(words);
  const value = end ? (salary.max ?? salary.min) : salary.min;
  const plain =
    field.control === 'number' ||
    /\b(no|without) commas?\b|\ba number\b|\bnumbers? only\b|\bnumeric\b/.test(label);
  return text(plain ? String(value) : `${amount(value)} ${salary.currency}`);
}

/** A salary-range option ("€60,000 - €70,000", "60k-70k") that contains the minimum. */
function salaryTarget(words: string, min: number): OptionTarget {
  return { text: words, patterns: [], fuzzy: false, amount: min };
}
