import type { ResumeExtract } from '@employ-me/core';
import { educationForm, workForm } from './to-form';
import type { ProfileForm } from './types';

export interface Prefilled {
  readonly form: ProfileForm;
  /** Schema paths the Resume filled in, for the review step to point out. */
  readonly paths: readonly string[];
}

/**
 * Pre-fills the form from what the Provider read in your Resume (design.md
 * "Setup"). Only blank fields are filled, so running it again never
 * overwrites what you typed. The extract has no Work Authorization, Self-ID,
 * screening or salary: those come from the questionnaire.
 */
export function applyExtract(form: ProfileForm, extract: ResumeExtract, newId: () => string): Prefilled {
  const paths: string[] = [];
  const fill = (path: string, current: string, incoming: string | undefined): string => {
    const value = incoming?.trim() ?? '';
    if (current.trim() !== '' || value === '') return current;
    paths.push(path);
    return value;
  };
  const list = <T>(path: string, current: readonly T[], incoming: readonly T[]): readonly T[] => {
    if (current.length > 0 || incoming.length === 0) return current;
    paths.push(path);
    return incoming;
  };

  const { identity, contact, address, links, background } = extract;
  const legal = identity?.legalName;
  const preferred = identity?.preferredName;
  const phone = contact?.phone;
  const next: ProfileForm = {
    ...form,
    identity: {
      ...form.identity,
      legalFirst: fill('identity.legalName.first', form.identity.legalFirst, legal?.first),
      legalMiddle: fill('identity.legalName.middle', form.identity.legalMiddle, legal?.middle),
      legalLast: fill('identity.legalName.last', form.identity.legalLast, legal?.last),
      preferredFirst: fill('identity.preferredName.first', form.identity.preferredFirst, preferred?.first),
      preferredLast: fill('identity.preferredName.last', form.identity.preferredLast, preferred?.last),
    },
    contact: {
      email: fill('contact.email', form.contact.email, contact?.email),
      phoneCountryCode: fill('contact.phone.countryCode', form.contact.phoneCountryCode, phone?.countryCode),
      phoneNumber: fill('contact.phone.number', form.contact.phoneNumber, phone?.number),
      phoneType:
        form.contact.phoneType === '' && phone?.type !== undefined ? phone.type : form.contact.phoneType,
    },
    address: {
      line1: fill('address.line1', form.address.line1, address?.line1),
      line2: fill('address.line2', form.address.line2, address?.line2),
      city: fill('address.city', form.address.city, address?.city),
      region: fill('address.region', form.address.region, address?.region),
      postalCode: fill('address.postalCode', form.address.postalCode, address?.postalCode),
      country: fill('address.country', form.address.country, address?.country),
    },
    links: {
      linkedin: fill('links.linkedin', form.links.linkedin, links?.linkedin),
      github: fill('links.github', form.links.github, links?.github),
      portfolio: fill('links.portfolio', form.links.portfolio, links?.portfolio),
    },
    workHistory: list(
      'background.workHistory',
      form.workHistory,
      (background?.workHistory ?? []).map((entry) => workForm({ ...entry, id: newId() })),
    ),
    education: list(
      'background.education',
      form.education,
      (background?.education ?? []).map((entry) => educationForm({ ...entry, id: newId() })),
    ),
    skills: list(
      'background.skills',
      form.skills,
      (background?.skills ?? []).map((skill) => ({ name: skill.name, aliases: skill.aliases.join(', ') })),
    ),
    languages: list(
      'background.languages',
      form.languages,
      (background?.languages ?? []).map((language) => ({ ...language })),
    ),
  };
  if (next.contact.phoneType !== form.contact.phoneType) paths.push('contact.phone.type');
  return { form: next, paths };
}
