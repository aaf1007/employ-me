import { normalizeLabel, type CountryCode, type WorkAuthorization } from '@employ-me/core';
import type { OptionTarget } from '../match';
import type { ExtractedField } from '../types';
import { isChoice, missing, option, skip, yesNo, type Answer, type ProfileView } from './types';

// Export-control questions (workAuth.usPerson). Most ask whether you're a
// "U.S. person", and take Yes or No. Some list sanctioned countries instead,
// with a "None of the above" (Databricks, live 2026-10-28): being a U.S.
// person doesn't answer those, your citizenships and where you live do.

/** Places that sanctions lists name, by the country they're in. */
const SANCTIONED: ReadonlyArray<readonly [CountryCode, RegExp]> = [
  ['CU', /\bcuba\b/],
  ['IR', /\biran\b/],
  ['KP', /\bnorth korea\b|\bdprk\b/],
  ['SY', /\bsyria\b/],
  ['RU', /\brussia\b/],
  ['BY', /\bbelarus\b/],
  ['UA', /\bukraine\b|\bcrimea\b|\bdonetsk\b|\bluhansk\b|\bzaporizhzhia\b|\bkherson\b/],
  ['VE', /\bvenezuela\b/],
];
const NAMES_SANCTIONED = new RegExp(SANCTIONED.map(([, place]) => place.source).join('|'));
const NONE = /^none\b|\bnone of (the above|these|them)\b|\b(does|do) not apply\b|^not applicable\b/;
/** "Citizenship in a country other than Cuba…" names a place to leave it out: not a list this can read. */
const EXCEPT = /\b(other than|except|outside)\b/;
/** The kinds of "U.S. person" (citizen, green card, asylee, refugee), as option text. */
const US_PERSON_KIND = /\bu s\b|\bunited states\b|\bgreen card\b|\basylum\b|\basylee\b|\brefugee\b/;
const US_PERSON = /\bu s person\b/;

const YOURS = 'Choose what applies to you yourself.';

export function exportControlAnswer(
  field: ExtractedField,
  auth: WorkAuthorization,
  profile: ProfileView,
): Answer {
  const label = normalizeLabel(field.label);
  const options = isChoice(field) ? optionsOf(field).map(normalizeLabel) : [];
  const none = options.findIndex((o) => NONE.test(o));
  const listed = options.filter((_, i) => i !== none);
  if (none >= 0 && listed.length > 0) {
    if (listed.some((o) => EXCEPT.test(o))) return skip('notInProfile', YOURS);
    if (listed.every((o) => NAMES_SANCTIONED.test(o))) return sanctions(listed, profile, noneOf(field, none));
    if (listed.every((o) => US_PERSON_KIND.test(o))) {
      if (auth.usPerson === undefined) return missing('whether you are a "U.S. person"');
      // Which kind of U.S. person you are isn't in the Profile.
      if (!auth.usPerson) return option(noneOf(field, none));
    }
    return skip('notInProfile', YOURS);
  }
  // "Are you a citizen or resident of Cuba, Iran, …?" asks about those places, not about being a U.S. person.
  if (NAMES_SANCTIONED.test(label) && !US_PERSON.test(label)) {
    return EXCEPT.test(label) ? skip('notInProfile', YOURS) : sanctions([label], profile, null);
  }
  return auth.usPerson === undefined ? missing('whether you are a "U.S. person"') : yesNo(auth.usPerson);
}

/** "None of the above" (or No) when no place listed is one you're a citizen of or live in. */
function sanctions(listed: readonly string[], profile: ProfileView, none: OptionTarget | null): Answer {
  const citizenships = Object.values(profile.workAuthorization).flatMap((auth) => auth.citizenships);
  if (citizenships.length === 0) return missing('your citizenships');
  const yours = new Set([
    ...citizenships,
    ...(profile.address === undefined ? [] : [profile.address.country]),
  ]);
  const tied = SANCTIONED.some(
    ([country, place]) => yours.has(country) && listed.some((text) => place.test(text)),
  );
  if (tied) return skip('notInProfile', YOURS);
  return none === null ? yesNo(false) : option(none);
}

function optionsOf(field: ExtractedField): readonly string[] {
  return field.choices.length > 0 ? field.choices.map((c) => c.label) : field.options;
}

function noneOf(field: ExtractedField, index: number): OptionTarget {
  return { text: optionsOf(field)[index] ?? 'None of the above', patterns: [NONE], fuzzy: false };
}
