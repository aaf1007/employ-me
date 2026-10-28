import { PROFILE_SCHEMA_VERSION } from '@employ-me/core';
import { countryByCode } from '../../../reference';
import { issuesFrom, profileFieldsSchema, type ProfileFields } from '../../../storage';
import type { FormErrors, ProfileForm, Tri, WorkAuthorizationForm } from './types';

// Form → core Profile fields. Empty strings become absent values, a section
// you left entirely blank is left out, and numbers are parsed. The result is
// checked with the same strict schema the data layer uses.

const opt = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim());
const num = (value: string): number | undefined => (value.trim() === '' ? undefined : Number(value));
const bool = (value: Tri): boolean | undefined => (value === '' ? undefined : value === 'yes');

/** True when every string in the object is blank and every flag unset. */
function blank(values: readonly (string | boolean | readonly unknown[])[]): boolean {
  return values.every((value) =>
    typeof value === 'string'
      ? value.trim() === ''
      : typeof value === 'boolean'
        ? !value
        : value.length === 0,
  );
}

/** "+1", "1" or "001" → "+1". */
function callingCode(value: string): string {
  const digits = value.trim().replace(/^\+|^00/, '');
  return value.trim() === '' ? '' : `+${digits}`;
}

function workAuthorization(country: string, form: WorkAuthorizationForm) {
  return {
    citizenships: [...form.citizenships],
    authorizedNow: bool(form.authorizedNow),
    status: opt(form.status),
    sponsorship: form.sponsorship === '' ? undefined : form.sponsorship,
    explanation: opt(form.explanation),
    ...(country === 'US' ? { usPerson: bool(form.usPerson) } : {}),
  };
}

/** The candidate Profile fields, before validation. Its shape follows the schema, so error paths match. */
export function candidateFrom(form: ProfileForm) {
  const { identity, contact, address, links, preferences, screening } = form;
  const phoneBlank = blank([contact.phoneCountryCode, contact.phoneNumber, contact.phoneType]);
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    identity: blank(Object.values(identity))
      ? undefined
      : {
          legalName: {
            first: identity.legalFirst.trim(),
            middle: opt(identity.legalMiddle),
            last: identity.legalLast.trim(),
          },
          preferredName: blank([identity.preferredFirst, identity.preferredLast])
            ? undefined
            : { first: opt(identity.preferredFirst), last: opt(identity.preferredLast) },
          over18: bool(identity.over18),
        },
    contact:
      contact.email.trim() === '' && phoneBlank
        ? undefined
        : {
            email: opt(contact.email),
            phone: phoneBlank
              ? undefined
              : {
                  countryCode: callingCode(contact.phoneCountryCode),
                  number: contact.phoneNumber.trim(),
                  type: contact.phoneType === '' ? undefined : contact.phoneType,
                },
          },
    address: blank(Object.values(address))
      ? undefined
      : {
          line1: address.line1.trim(),
          line2: opt(address.line2),
          city: address.city.trim(),
          region: opt(address.region),
          postalCode: opt(address.postalCode),
          country: address.country,
        },
    links: { linkedin: opt(links.linkedin), github: opt(links.github), portfolio: opt(links.portfolio) },
    countries: [...form.countries],
    workAuthorization: Object.fromEntries(
      form.countries.flatMap((country) => {
        const auth = form.workAuthorization[country];
        return auth === undefined || blank(Object.values(auth))
          ? []
          : [[country, workAuthorization(country, auth)]];
      }),
    ),
    preferences: {
      relocation: bool(preferences.relocation),
      workModels: [...preferences.workModels],
      startDate: opt(preferences.startDate),
      noticePeriod: blank([preferences.noticeAmount, preferences.noticeUnit])
        ? undefined
        : {
            amount: num(preferences.noticeAmount),
            unit: preferences.noticeUnit === '' ? undefined : preferences.noticeUnit,
          },
      salary: Object.fromEntries(
        form.countries.flatMap((country) => {
          const salary = form.salary[country];
          if (salary === undefined || blank([salary.min, salary.max])) return [];
          return [
            [
              country,
              {
                currency: countryByCode(country)?.currency,
                min: num(salary.min),
                max: num(salary.max),
                period: salary.period === '' ? undefined : salary.period,
              },
            ],
          ];
        }),
      ),
    },
    background: {
      workHistory: form.workHistory.map((entry) => ({
        id: entry.id,
        employer: entry.employer.trim(),
        title: entry.title.trim(),
        location: opt(entry.location),
        startDate: entry.startDate,
        endDate: entry.current ? undefined : opt(entry.endDate),
        current: entry.current,
        description: opt(entry.description),
      })),
      education: form.education.map((entry) => ({
        id: entry.id,
        school: entry.school.trim(),
        degree: opt(entry.degree),
        degreeLevel: entry.degreeLevel === '' ? undefined : entry.degreeLevel,
        discipline: opt(entry.discipline),
        startDate: opt(entry.startDate),
        endDate: opt(entry.endDate),
        gpa: blank([entry.gpaValue, entry.gpaScale])
          ? undefined
          : { value: num(entry.gpaValue), scale: num(entry.gpaScale) },
      })),
      // Blank skills are dropped. Safe for error paths: a kept skill can't fail validation.
      skills: form.skills
        .filter((skill) => skill.name.trim() !== '')
        .map((skill) => ({
          name: skill.name.trim(),
          aliases: skill.aliases
            .split(',')
            .map((alias) => alias.trim())
            .filter((alias) => alias !== ''),
        })),
      // Not filtered: errors are reported by index, so rows must stay aligned with the form's.
      languages: form.languages.map((language) => ({
        language: language.language.trim(),
        proficiency: language.proficiency === '' ? undefined : language.proficiency,
      })),
    },
    selfId: form.selfId,
    screening: {
      howHeard: opt(screening.howHeard),
      referred: bool(screening.referred),
      workedHereBefore: Object.fromEntries(
        screening.workedHereBefore
          .filter((row) => row.employer.trim() !== '')
          .map((row) => [row.employer.trim().toLowerCase(), row.workedHere === 'yes']),
      ),
      backgroundCheck: bool(screening.backgroundCheck),
      nonCompete: bool(screening.nonCompete),
    },
  };
}

export type Validated =
  { readonly ok: true; readonly fields: ProfileFields } | { readonly ok: false; readonly errors: FormErrors };

export function validateForm(form: ProfileForm): Validated {
  const parsed = profileFieldsSchema.safeParse(candidateFrom(form));
  if (parsed.success) return { ok: true, fields: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of issuesFrom(parsed.error)) errors[issue.path] ??= issue.message;
  return { ok: false, errors };
}

/** Only the errors under these path prefixes: one setup step's sections. */
export function errorsUnder(errors: FormErrors, prefixes: readonly string[]): FormErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([path]) =>
      prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)),
    ),
  );
}
