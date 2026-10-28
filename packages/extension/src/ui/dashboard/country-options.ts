import { COUNTRIES, countryName } from '../../reference';

export const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({ value: country.code, label: country.name }));

export { countryName };
