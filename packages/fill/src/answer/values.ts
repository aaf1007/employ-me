import type { CountryClassification } from '../classify';
import type { OptionTarget } from '../match';
import type { Answer } from './types';

// Small helpers for answers that came through a Provider mapping.

export function describeValue(value: Extract<Answer, { kind: 'answer' }>['value']): string {
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
      return '';
  }
}

export function countryOf(classification: CountryClassification): Pick<CountryClassification, 'country'> {
  return classification.country === undefined ? {} : { country: classification.country };
}

/** The Provider's mapping of this form's options to canonical values ("Yes, I am" → yes). */
export function withProviderOptions(
  value: Extract<Answer, { kind: 'answer' }>['value'],
  options: readonly { option: string; value: string }[],
): Extract<Answer, { kind: 'answer' }>['value'] {
  if (options.length === 0) return value;
  const wanted = value.kind === 'yesNo' ? (value.yes ? 'yes' : 'no') : null;
  if (wanted === null) return value;
  const matching = options.filter((o) => o.value === wanted).map((o) => o.option);
  if (matching.length === 0) return value;
  const target: OptionTarget = { text: matching[0] ?? wanted, patterns: [], fuzzy: false };
  return { kind: 'option', target };
}
