/**
 * Countries you can apply in, each with its own currency: salary is kept per
 * country in that country's currency (design.md "Preferences"). Self-ID
 * Answers exist for the US and Canada only (glossary "Self-ID Answer").
 */
export interface Country {
  readonly code: string;
  readonly name: string;
  readonly currency: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'BE', name: 'Belgium', currency: 'EUR' },
  { code: 'BR', name: 'Brazil', currency: 'BRL' },
  { code: 'CZ', name: 'Czechia', currency: 'CZK' },
  { code: 'DK', name: 'Denmark', currency: 'DKK' },
  { code: 'FI', name: 'Finland', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'IL', name: 'Israel', currency: 'ILS' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'MX', name: 'Mexico', currency: 'MXN' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { code: 'NO', name: 'Norway', currency: 'NOK' },
  { code: 'PL', name: 'Poland', currency: 'PLN' },
  { code: 'PT', name: 'Portugal', currency: 'EUR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'KR', name: 'South Korea', currency: 'KRW' },
  { code: 'ES', name: 'Spain', currency: 'EUR' },
  { code: 'SE', name: 'Sweden', currency: 'SEK' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
];

const OTHER_NAMES: Readonly<Record<string, string>> = {
  usa: 'US',
  'united states of america': 'US',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
};

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((country) => country.code === code);
}

export function countryName(code: string): string {
  return countryByCode(code)?.name ?? code;
}

/** "US", "us", "United States", "USA" → "US". Null when it isn't a country in the list. */
export function countryCodeFrom(text: string): string | null {
  const wanted = text.trim().toLowerCase();
  if (wanted === '') return null;
  const byCode = COUNTRIES.find((country) => country.code.toLowerCase() === wanted);
  const byName = COUNTRIES.find((country) => country.name.toLowerCase() === wanted);
  return byCode?.code ?? byName?.code ?? OTHER_NAMES[wanted] ?? null;
}
