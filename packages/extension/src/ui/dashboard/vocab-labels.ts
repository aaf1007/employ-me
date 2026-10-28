import { VOCAB, type VocabId, type VocabValue } from '@employ-me/core';
import type { Option } from './controls/SelectField';

/** How each canonical value reads in the dashboard. Every vocabulary value has one. */
const LABELS: { readonly [V in VocabId]: Readonly<Record<VocabValue<V>, string>> } = {
  yesNo: { yes: 'Yes', no: 'No' },
  phoneType: { mobile: 'Mobile', home: 'Home', work: 'Work' },
  sponsorship: { yes: 'Yes, I need sponsorship', no: 'No', ask: 'Ask me each time' },
  workModel: { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' },
  noticeUnit: { days: 'days', weeks: 'weeks', months: 'months' },
  salaryPeriod: { year: 'per year', month: 'per month', hour: 'per hour' },
  degreeLevel: {
    highSchool: 'High school',
    associate: 'Associate',
    bachelor: 'Bachelor’s',
    master: 'Master’s',
    doctorate: 'Doctorate',
    other: 'Other',
  },
  languageProficiency: {
    elementary: 'Elementary',
    limitedWorking: 'Limited working',
    professionalWorking: 'Professional working',
    fullProfessional: 'Full professional',
    native: 'Native or bilingual',
  },
  usSex: { female: 'Female', male: 'Male', nonBinary: 'Non-binary', decline: 'Decline to answer' },
  usHispanicLatino: { yes: 'Yes', no: 'No', decline: 'Decline to answer' },
  usRace: {
    americanIndianOrAlaskaNative: 'American Indian or Alaska Native',
    asian: 'Asian',
    blackOrAfricanAmerican: 'Black or African American',
    nativeHawaiianOrPacificIslander: 'Native Hawaiian or Other Pacific Islander',
    white: 'White',
    twoOrMoreRaces: 'Two or more races',
    decline: 'Decline to answer',
  },
  usVeteran: {
    protectedVeteran: 'I identify as a protected veteran',
    notProtectedVeteran: 'I am not a protected veteran',
    decline: 'Decline to answer',
  },
  usDisability: {
    yes: 'Yes, I have a disability (or had one)',
    no: 'No, I don’t have a disability',
    decline: 'Decline to answer',
  },
  caGenderIdentity: {
    woman: 'Woman',
    man: 'Man',
    nonBinary: 'Non-binary',
    twoSpirit: 'Two-Spirit',
    decline: 'Decline to answer',
  },
  caIndigenous: {
    firstNations: 'First Nations',
    metis: 'Métis',
    inuit: 'Inuit',
    no: 'Not Indigenous',
    decline: 'Decline to answer',
  },
  caVisibleMinority: { yes: 'Yes', no: 'No', decline: 'Decline to answer' },
  caDisability: { yes: 'Yes', no: 'No', decline: 'Decline to answer' },
};

export function vocabLabel<V extends VocabId>(vocab: V, value: VocabValue<V>): string {
  const labels: Readonly<Record<VocabValue<V>, string>> = LABELS[vocab];
  return labels[value];
}

export function vocabOptions<V extends VocabId>(vocab: V): Option<VocabValue<V>>[] {
  const values: readonly VocabValue<V>[] = VOCAB[vocab];
  return values.map((value) => ({ value, label: vocabLabel(vocab, value) }));
}
