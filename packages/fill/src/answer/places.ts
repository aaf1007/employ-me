import { normalizeLabel, type CountryCode } from '@employ-me/core';
import type { OptionTarget } from '../match';
import { COUNTRY_DISPLAY, COUNTRY_NAMES, regionName } from '../posting';

// Option targets for places: countries, provinces and states, cities.

export function countryName(code: CountryCode): string {
  return COUNTRY_DISPLAY[code] ?? code;
}

export function countryTarget(code: CountryCode): OptionTarget {
  const names = COUNTRY_NAMES.find(([c]) => c === code)?.[1] ?? '';
  // Plain-word names only; the regex alternatives ("u\\.s\\.") are for free text.
  const alternatives = names.split('|').filter((name) => /^[a-z ]+$/.test(name));
  const display = countryName(code);
  return {
    text: display,
    patterns: [
      new RegExp(`^(${alternatives.join('|')})$`),
      new RegExp(`^(${alternatives.join('|')})\\b`),
      new RegExp(`\\b(${alternatives.filter((a) => a.length > 3).join('|') || 'zzz'})\\b`),
    ],
    search: display,
    fuzzy: false,
  };
}

export function regionTarget(country: CountryCode, code: string): OptionTarget {
  const name = regionName(country, code) ?? code;
  return {
    text: name,
    patterns: [
      new RegExp(`^${escapeRe(normalizeLabel(name))}\\b`),
      new RegExp(`^${escapeRe(code.toLowerCase())}$`),
    ],
    search: name,
    fuzzy: false,
  };
}

/** A city in a location picker: "Toronto, Ontario, Canada", preferring the entry naming the right region and country. */
export function cityTarget(city: string, country: CountryCode, regionCode?: string): OptionTarget {
  const c = escapeRe(normalizeLabel(city));
  const region = regionCode === undefined ? null : (regionName(country, regionCode) ?? regionCode);
  const regionAlt =
    region === null
      ? null
      : `${escapeRe(normalizeLabel(region))}|${escapeRe((regionCode ?? '').toLowerCase())}`;
  const countryAlt = `${escapeRe(normalizeLabel(countryName(country)))}|${country.toLowerCase()}`;
  return {
    text: [city, region, countryName(country)].filter((p) => p !== null).join(', '),
    patterns: [
      ...(regionAlt === null ? [] : [new RegExp(`^${c}\\b.*\\b(${regionAlt})\\b.*\\b(${countryAlt})\\b`)]),
      new RegExp(`^${c}\\b.*\\b(${countryAlt})\\b`),
      ...(regionAlt === null ? [] : [new RegExp(`^${c}\\b.*\\b(${regionAlt})\\b`)]),
    ],
    search: city,
    fuzzy: false,
    firstWins: true,
  };
}

export function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
