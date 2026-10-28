import type { SelfIdAnswers, VocabValue } from '@employ-me/core';

// The Profile as the dashboard edits it: every input is a string (or a
// yes/no/unanswered choice), so a half-typed value can sit in the form.
// from-form.ts turns it back into core's Profile fields and validates them;
// error paths are core's schema paths ("identity.legalName.first"), so each
// input shows its own error.

/** A yes/no question you may not have answered yet. */
export type Tri = '' | 'yes' | 'no';

export interface IdentityForm {
  readonly legalFirst: string;
  readonly legalMiddle: string;
  readonly legalLast: string;
  readonly preferredFirst: string;
  readonly preferredLast: string;
  readonly over18: Tri;
}

export interface ContactForm {
  readonly email: string;
  readonly phoneCountryCode: string;
  readonly phoneNumber: string;
  readonly phoneType: '' | VocabValue<'phoneType'>;
}

export interface AddressForm {
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
}

export interface LinksForm {
  readonly linkedin: string;
  readonly github: string;
  readonly portfolio: string;
}

export interface WorkForm {
  readonly id: string;
  readonly employer: string;
  readonly title: string;
  readonly location: string;
  /** YYYY-MM, as <input type="month"> gives it. */
  readonly startDate: string;
  readonly endDate: string;
  readonly current: boolean;
  readonly description: string;
}

export interface EducationForm {
  readonly id: string;
  readonly school: string;
  readonly degree: string;
  readonly degreeLevel: '' | VocabValue<'degreeLevel'>;
  readonly discipline: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly gpaValue: string;
  readonly gpaScale: string;
}

export interface SkillForm {
  readonly name: string;
  /** Comma-separated. */
  readonly aliases: string;
}

export interface LanguageForm {
  readonly language: string;
  readonly proficiency: '' | VocabValue<'languageProficiency'>;
}

export interface WorkAuthorizationForm {
  readonly authorizedNow: Tri;
  readonly sponsorship: '' | VocabValue<'sponsorship'>;
  /** Country codes. */
  readonly citizenships: readonly string[];
  readonly status: string;
  readonly explanation: string;
  /** US only. */
  readonly usPerson: Tri;
}

export interface SalaryForm {
  readonly min: string;
  readonly max: string;
  readonly period: '' | VocabValue<'salaryPeriod'>;
}

export interface PreferencesForm {
  readonly relocation: Tri;
  readonly workModels: readonly VocabValue<'workModel'>[];
  /** YYYY-MM-DD. */
  readonly startDate: string;
  readonly noticeAmount: string;
  readonly noticeUnit: '' | VocabValue<'noticeUnit'>;
}

export interface WorkedHereForm {
  readonly employer: string;
  readonly workedHere: 'yes' | 'no';
}

export interface ScreeningForm {
  readonly howHeard: string;
  readonly referred: Tri;
  readonly backgroundCheck: Tri;
  readonly nonCompete: Tri;
  readonly workedHereBefore: readonly WorkedHereForm[];
}

export interface ProfileForm {
  readonly identity: IdentityForm;
  readonly contact: ContactForm;
  readonly address: AddressForm;
  readonly links: LinksForm;
  /** Countries you apply in, in the order you added them. */
  readonly countries: readonly string[];
  /** Kept for countries you un-tick too, so ticking one again restores it. Only ticked ones are saved. */
  readonly workAuthorization: Readonly<Record<string, WorkAuthorizationForm>>;
  readonly salary: Readonly<Record<string, SalaryForm>>;
  readonly preferences: PreferencesForm;
  readonly workHistory: readonly WorkForm[];
  readonly education: readonly EducationForm[];
  readonly skills: readonly SkillForm[];
  readonly languages: readonly LanguageForm[];
  readonly screening: ScreeningForm;
  readonly selfId: SelfIdAnswers;
}

/** Error messages by schema path. */
export type FormErrors = Readonly<Record<string, string>>;
