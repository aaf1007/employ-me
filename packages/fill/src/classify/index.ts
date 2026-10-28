import {
  labelsMatch,
  normalizeLabel,
  sensitivityOf,
  type CountryCode,
  type FieldType,
  type SavedAnswer,
} from '@employ-me/core';
import { countriesNamedIn } from '../posting';
import type { Classification, ExtractedField, FillContext } from '../types';
import { autocompleteType, ruleFor } from './rules';
import { detectSensitive, type SelfIdTopic } from './sensitive';

export { isSelfIdSection, selfIdTopic, type SelfIdTopic } from './sensitive';
export { LANGUAGES } from './rules';

/** Which country's Work Authorization and Self-ID Answers apply (design.md "Country-specific answers"). */
export type CountryChoice =
  | { readonly kind: 'known'; readonly country: CountryCode }
  | { readonly kind: 'unclear'; readonly candidates: readonly CountryCode[] };

export interface ClassifyContext extends FillContext {
  readonly savedAnswers: readonly SavedAnswer[];
  /** The Posting's country, from the page or the caller. */
  readonly country: CountryChoice;
  /** The adapter map: first step of the cascade. */
  readonly adapterMap?: (field: ExtractedField) => FieldType | null;
}

/** A classification plus the country its answer belongs to, for country-specific types. */
export interface CountryClassification extends Classification {
  /** Set for Work Authorization and Self-ID types. */
  readonly country?: CountryChoice;
}

/**
 * Fixed rules, in order: adapter map, then the deterministic Self-ID,
 * Attestation and never-stored checks, then `autocomplete` tokens, regexes
 * and synonyms, then exact Saved Answer match (research §6 step 3). What's
 * left is `unknown` (or `freeText.question` for long answers): those may go
 * to the Provider through core's `toProviderField`. English only
 * (design.md "Tech").
 */
export function classifyField(field: ExtractedField, context: ClassifyContext): CountryClassification {
  const label = normalizeLabel(field.label);
  const fromAdapter = context.adapterMap?.(field) ?? null;
  if (fromAdapter !== null) {
    return withSavedAnswer(
      withCountry({ fieldType: fromAdapter, source: 'adapter' }, field, context),
      field,
      context,
    );
  }

  const sensitive = detectSensitive({
    label,
    section: normalizeLabel(field.section ?? ''),
    description: normalizeLabel(field.description ?? ''),
    options: field.options.map(normalizeLabel),
    isPassword: field.element.getAttribute('type')?.toLowerCase() === 'password',
  });
  if (sensitive !== null) {
    if (sensitive.kind === 'fieldType') return { fieldType: sensitive.fieldType, source: 'rules' };
    return selfIdClassification(sensitive.topic, field, context);
  }

  // The visible label wins when the page's autocomplete token disagrees with
  // it: sites put autocomplete="name" on a "First name" box.
  const fromRules = ruleFor(label, field.control);
  const fromAutocomplete = autocompleteType(field.autocomplete);
  if (fromRules !== null) {
    // "Location" whose description says "Country you're currently residing in" asks for a country.
    const fieldType =
      fromRules === 'address.location' && /\bcountry\b/.test(normalizeLabel(field.description ?? ''))
        ? 'address.country'
        : fromRules;
    return withCountry({ fieldType, source: 'rules' }, field, context);
  }
  if (fromAutocomplete !== null) {
    return withCountry({ fieldType: fromAutocomplete, source: 'autocomplete' }, field, context);
  }

  const leftover: FieldType = isLongAnswer(field) ? 'freeText.question' : 'unknown';
  return withSavedAnswer({ fieldType: leftover, source: 'rules' }, field, context);
}

/** Exact Saved Answer match (design.md "Who fills what"), for questions the rules don't answer from the Profile. */
function withSavedAnswer(
  classification: Classification,
  field: ExtractedField,
  context: ClassifyContext,
): Classification {
  if (classification.fieldType !== 'unknown' && classification.fieldType !== 'freeText.question')
    return classification;
  const saved = context.savedAnswers.find((answer) => labelsMatch(answer.question, field.label));
  return saved === undefined
    ? classification
    : { fieldType: classification.fieldType, source: 'savedAnswer', savedAnswerId: saved.id };
}

function isLongAnswer(field: ExtractedField): boolean {
  return field.widget === 'textarea' || (field.widget === 'text' && (field.maxLength ?? 0) > 255);
}

/** Country-specific types get the country their answer is for: the one the question names, else the Posting's. */
function withCountry(
  classification: Classification,
  field: ExtractedField,
  context: ClassifyContext,
): CountryClassification {
  const perCountry =
    classification.fieldType.startsWith('workAuth.') ||
    classification.fieldType === 'pref.salary' ||
    sensitivityOf(classification.fieldType) === 'selfId';
  if (!perCountry) {
    return classification;
  }
  return { ...classification, country: countryFor(field, context) };
}

function countryFor(field: ExtractedField, context: ClassifyContext): CountryChoice {
  const named = countriesNamedIn(field.label);
  const [only] = named;
  if (named.length === 1 && only !== undefined) return { kind: 'known', country: only };
  if (named.length > 1) return { kind: 'unclear', candidates: named };
  return context.country;
}

const BY_COUNTRY: Readonly<Record<Exclude<SelfIdTopic, 'other'>, Partial<Record<string, FieldType>>>> = {
  gender: { US: 'selfId.us.sex', CA: 'selfId.ca.genderIdentity' },
  hispanicLatino: { US: 'selfId.us.hispanicLatino' },
  race: { US: 'selfId.us.race' },
  visibleMinority: { CA: 'selfId.ca.visibleMinority' },
  indigenous: { CA: 'selfId.ca.indigenous' },
  veteran: { US: 'selfId.us.veteran' },
  disability: { US: 'selfId.us.disability', CA: 'selfId.ca.disability' },
};

/**
 * Self-ID types are per country (glossary "Self-ID Answer"). A topic the
 * country has no stored answer for (a Canadian ethnicity list, an Irish
 * gender question) is `selfId.other`, which fills only a "decline" option.
 */
function selfIdClassification(
  topic: SelfIdTopic,
  field: ExtractedField,
  context: ClassifyContext,
): CountryClassification {
  if (topic === 'other') return { fieldType: 'selfId.other', source: 'rules' };
  const country = countryFor(field, context);
  if (country.kind === 'unclear') return { fieldType: 'selfId.other', source: 'rules', country };
  return { fieldType: BY_COUNTRY[topic][country.country] ?? 'selfId.other', source: 'rules', country };
}
