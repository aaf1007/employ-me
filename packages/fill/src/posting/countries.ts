import type { CountryCode } from '@employ-me/core';

// Country names, US states and Canadian provinces, for reading a Posting's
// location and the country a question names ("authorized to work in the
// United States?"). English only (design.md "Tech").

/** Patterns over lower-cased text, each with word boundaries applied by the caller. */
export const COUNTRY_NAMES: ReadonlyArray<readonly [CountryCode, string]> = [
  ['US', 'united states of america|united states|u\\.\\s?s\\.\\s?a\\.?|usa|u\\.s\\.|us'],
  ['CA', 'canada|canadian|can'],
  ['GB', 'united kingdom|great britain|britain|england|scotland|wales|northern ireland|uk|u\\.k\\.'],
  ['IE', 'ireland|irish'],
  ['DE', 'germany|deutschland|german'],
  ['FR', 'france|french republic'],
  ['NL', 'netherlands|holland'],
  ['ES', 'spain'],
  ['PT', 'portugal'],
  ['IT', 'italy'],
  ['CH', 'switzerland'],
  ['AT', 'austria'],
  ['BE', 'belgium'],
  ['SE', 'sweden'],
  ['NO', 'norway'],
  ['DK', 'denmark'],
  ['FI', 'finland'],
  ['PL', 'poland'],
  ['CZ', 'czech republic|czechia'],
  ['RO', 'romania'],
  ['GR', 'greece'],
  ['IL', 'israel'],
  ['IN', 'india'],
  ['SG', 'singapore'],
  ['JP', 'japan'],
  ['KR', 'south korea|korea'],
  ['CN', 'china'],
  ['HK', 'hong kong'],
  ['TW', 'taiwan'],
  ['AU', 'australia'],
  ['NZ', 'new zealand'],
  ['MX', 'mexico'],
  ['BR', 'brazil'],
  ['AR', 'argentina'],
  ['CO', 'colombia'],
  ['CL', 'chile'],
  ['ZA', 'south africa'],
  ['AE', 'united arab emirates|uae|dubai'],
  ['ID', 'indonesia'],
  ['PH', 'philippines'],
  ['KZ', 'kazakhstan'],
];

/** Display names for the countries we may need to choose in a form's own list. */
export const COUNTRY_DISPLAY: Readonly<Record<string, string>> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  IE: 'Ireland',
  DE: 'Germany',
  FR: 'France',
  NL: 'Netherlands',
  ES: 'Spain',
  IN: 'India',
  AU: 'Australia',
  MX: 'Mexico',
};

/** Calling codes for the countries above, for phone country pickers. */
export const CALLING_CODES: Readonly<Record<string, string>> = {
  US: '+1',
  CA: '+1',
  GB: '+44',
  IE: '+353',
  DE: '+49',
  FR: '+33',
  NL: '+31',
  ES: '+34',
  IN: '+91',
  AU: '+61',
  MX: '+52',
};

const US_STATES = table(
  'AL=alabama;AK=alaska;AZ=arizona;AR=arkansas;CA=california;CO=colorado;CT=connecticut;DE=delaware;' +
    'DC=district of columbia;FL=florida;GA=georgia;HI=hawaii;ID=idaho;' +
    'IL=illinois;IN=indiana;IA=iowa;KS=kansas;KY=kentucky;LA=louisiana;ME=maine;MD=maryland;' +
    'MA=massachusetts;MI=michigan;MN=minnesota;MS=mississippi;MO=missouri;MT=montana;NE=nebraska;' +
    'NV=nevada;NH=new hampshire;NJ=new jersey;NM=new mexico;NY=new york;NC=north carolina;' +
    'ND=north dakota;OH=ohio;OK=oklahoma;OR=oregon;PA=pennsylvania;RI=rhode island;SC=south carolina;' +
    'SD=south dakota;TN=tennessee;TX=texas;UT=utah;VT=vermont;VA=virginia;WA=washington;' +
    'WV=west virginia;WI=wisconsin;WY=wyoming',
);

const CA_PROVINCES = table(
  'AB=alberta;BC=british columbia;MB=manitoba;NB=new brunswick;' +
    'NL=newfoundland and labrador|newfoundland;NS=nova scotia;NT=northwest territories;NU=nunavut;' +
    'ON=ontario;PE=prince edward island;QC=quebec|québec;SK=saskatchewan;YT=yukon',
);

/** `"AL=alabama;AK=alaska"` → [["AL", "alabama"], …]. Kept as one string so the tables stay compact. */
function table(spec: string): ReadonlyArray<readonly [string, string]> {
  return spec.split(';').map((pair) => {
    const [code = '', names = ''] = pair.split('=');
    return [code, names] as const;
  });
}

/** Full names of Canadian provinces and US states, by code, for "Province of residence" lists. */
export function regionName(country: CountryCode, code: string): string | null {
  const table = country === 'CA' ? CA_PROVINCES : country === 'US' ? US_STATES : [];
  const entry = table.find(([c]) => c === code.toUpperCase());
  const name = entry?.[1].split('|')[0];
  return name === undefined ? null : name.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Cities that identify their country on their own, for locations like "London" or "Toronto". */
const CITIES: ReadonlyArray<readonly [CountryCode, string]> = [
  [
    'US',
    'san francisco|new york city|new york|nyc|seattle|boston|chicago|austin|los angeles|denver|atlanta|washington,? d\\.?c\\.?|menlo park|palo alto|mountain view|foster city|sunnyvale|san jose|san diego|miami|dallas|houston|pittsburgh|philadelphia|portland|westlake|las vegas',
  ],
  [
    'CA',
    'toronto|montreal|montréal|vancouver|ottawa|calgary|edmonton|waterloo|kitchener|kitchener-waterloo|oakville|burnaby|mississauga|winnipeg|halifax|quebec city',
  ],
  ['GB', 'london|manchester|edinburgh|cambridge|oxford|bristol|high wycombe'],
  ['IE', 'dublin|cork'],
  ['DE', 'berlin|munich|münchen|hamburg|frankfurt|cologne|aachen'],
  ['FR', 'paris|lyon'],
  ['NL', 'amsterdam|rotterdam'],
  ['ES', 'madrid|barcelona'],
  ['PT', 'lisbon|porto'],
  ['IT', 'milan|rome|ferrara'],
  ['PL', 'warsaw|krakow|kraków'],
  ['SG', 'singapore'],
  ['JP', 'tokyo'],
  ['IN', 'bangalore|bengaluru|mumbai|hyderabad|delhi'],
  ['AU', 'sydney|melbourne'],
];

const boundary = (alternatives: string) => new RegExp(`(?:^|[^\\p{L}])(?:${alternatives})(?![\\p{L}])`, 'iu');

const COUNTRY_RES = COUNTRY_NAMES.map(([code, names]) => [code, boundary(names)] as const);
const CITY_RES = CITIES.map(([code, names]) => [code, boundary(names)] as const);
const STATE_CODE = new Set(US_STATES.map(([code]) => code));
const PROVINCE_CODE = new Set(CA_PROVINCES.map(([code]) => code));
const STATE_NAME = boundary(US_STATES.map(([, name]) => name).join('|'));
const PROVINCE_NAME = boundary(CA_PROVINCES.map(([, name]) => name).join('|'));

/**
 * Countries a location string names, e.g. "Toronto, ON" → [CA],
 * "New York City, NY; San Francisco, CA" → [US], "London, UK; Ontario, CAN" → [GB, CA].
 */
export function countriesIn(location: string): CountryCode[] {
  const found = new Set<CountryCode>();
  for (const part of location.split(/[;|/]|\bor\b|\band\b|\s-\s/i)) {
    for (const code of countriesInPart(part)) found.add(code);
  }
  return [...found];
}

function countriesInPart(part: string): CountryCode[] {
  const text = part.trim();
  if (text === '') return [];
  const named = COUNTRY_RES.filter(([, re]) => re.test(text)).map(([code]) => code);
  if (named.length > 0) return named;
  // "City, ST": a trailing two-letter code. "CA" is California here, not Canada.
  const tail = /,\s*([A-Z]{2})\b/.exec(text)?.[1];
  if (tail !== undefined) {
    if (STATE_CODE.has(tail)) return ['US'];
    if (PROVINCE_CODE.has(tail)) return ['CA'];
  }
  if (PROVINCE_NAME.test(text)) return ['CA'];
  if (STATE_NAME.test(text)) return ['US'];
  const cities = CITY_RES.filter(([, re]) => re.test(text)).map(([code]) => code);
  return cities;
}

/** The countries a question names, e.g. "legally authorized to work in the United States?" → [US]. */
export function countriesNamedIn(question: string): CountryCode[] {
  return COUNTRY_RES.filter(([code, re]) => {
    if (!re.test(question)) return false;
    // "us" and "can" are ordinary words in questions ("tell us", "can you"), and
    // "America" is often North or Latin America.
    if (code === 'US') return /united states|\bu\.\s?s\.|\busa\b/i.test(question) || /\bUS\b/.test(question);
    if (code === 'CA') return /canada|canadian/i.test(question);
    return !/\b(german|french|irish)\b/i.test(question) || /germany|france|ireland/i.test(question);
  }).map(([code]) => code);
}
