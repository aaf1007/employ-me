import type { EducationEntry, WorkAuthorization, WorkEntry } from '@employ-me/core';
import type { ProfileFields } from '../../../storage';
import type { EducationForm, ProfileForm, SalaryForm, Tri, WorkAuthorizationForm, WorkForm } from './types';

export function tri(value: boolean | undefined): Tri {
  if (value === undefined) return '';
  return value ? 'yes' : 'no';
}

const text = (value: string | undefined): string => value ?? '';
const number = (value: number | undefined): string => (value === undefined ? '' : String(value));

export const BLANK_WORK_AUTHORIZATION: WorkAuthorizationForm = {
  authorizedNow: '',
  sponsorship: '',
  citizenships: [],
  status: '',
  explanation: '',
  usPerson: '',
};

export const BLANK_SALARY: SalaryForm = { min: '', max: '', period: 'year' };

export function blankWork(id: string): WorkForm {
  return {
    id,
    employer: '',
    title: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    description: '',
  };
}

export function blankEducation(id: string): EducationForm {
  return {
    id,
    school: '',
    degree: '',
    degreeLevel: '',
    discipline: '',
    startDate: '',
    endDate: '',
    gpaValue: '',
    gpaScale: '',
  };
}

export function workForm(entry: WorkEntry): WorkForm {
  return {
    id: entry.id,
    employer: entry.employer,
    title: entry.title,
    location: text(entry.location),
    startDate: entry.startDate,
    endDate: text(entry.endDate),
    current: entry.current,
    description: text(entry.description),
  };
}

export function educationForm(entry: EducationEntry): EducationForm {
  return {
    id: entry.id,
    school: entry.school,
    degree: text(entry.degree),
    degreeLevel: entry.degreeLevel ?? '',
    discipline: text(entry.discipline),
    startDate: text(entry.startDate),
    endDate: text(entry.endDate),
    gpaValue: number(entry.gpa?.value),
    gpaScale: number(entry.gpa?.scale),
  };
}

function workAuthorizationForm(auth: WorkAuthorization): WorkAuthorizationForm {
  return {
    authorizedNow: tri(auth.authorizedNow),
    sponsorship: auth.sponsorship,
    citizenships: auth.citizenships,
    status: text(auth.status),
    explanation: text(auth.explanation),
    usPerson: tri(auth.usPerson),
  };
}

export function toForm(fields: ProfileFields): ProfileForm {
  const { identity, contact, address, links, preferences, background, screening } = fields;
  return {
    identity: {
      legalFirst: text(identity?.legalName.first),
      legalMiddle: text(identity?.legalName.middle),
      legalLast: text(identity?.legalName.last),
      preferredFirst: text(identity?.preferredName?.first),
      preferredLast: text(identity?.preferredName?.last),
      over18: tri(identity?.over18),
    },
    contact: {
      email: text(contact?.email),
      phoneCountryCode: text(contact?.phone?.countryCode),
      phoneNumber: text(contact?.phone?.number),
      phoneType: contact?.phone?.type ?? '',
    },
    address: {
      line1: text(address?.line1),
      line2: text(address?.line2),
      city: text(address?.city),
      region: text(address?.region),
      postalCode: text(address?.postalCode),
      country: text(address?.country),
    },
    links: { linkedin: text(links.linkedin), github: text(links.github), portfolio: text(links.portfolio) },
    countries: fields.countries,
    workAuthorization: Object.fromEntries(
      Object.entries(fields.workAuthorization).map(([country, auth]) => [
        country,
        workAuthorizationForm(auth),
      ]),
    ),
    salary: Object.fromEntries(
      Object.entries(preferences.salary).map(([country, salary]) => [
        country,
        { min: number(salary.min), max: number(salary.max), period: salary.period },
      ]),
    ),
    preferences: {
      relocation: tri(preferences.relocation),
      workModels: preferences.workModels,
      startDate: text(preferences.startDate),
      noticeAmount: number(preferences.noticePeriod?.amount),
      noticeUnit: preferences.noticePeriod?.unit ?? '',
    },
    workHistory: background.workHistory.map(workForm),
    education: background.education.map(educationForm),
    skills: background.skills.map((skill) => ({ name: skill.name, aliases: skill.aliases.join(', ') })),
    languages: background.languages.map((language) => ({ ...language })),
    screening: {
      howHeard: text(screening.howHeard),
      referred: tri(screening.referred),
      backgroundCheck: tri(screening.backgroundCheck),
      nonCompete: tri(screening.nonCompete),
      workedHereBefore: Object.entries(screening.workedHereBefore).map(([employer, workedHere]) => ({
        employer,
        workedHere: workedHere ? 'yes' : 'no',
      })),
    },
    selfId: fields.selfId,
  };
}
