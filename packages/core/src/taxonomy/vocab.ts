/**
 * Canonical answer vocabularies. Profile schemas store these values, and the
 * fill engine maps each form's own option wording onto them. Keep values
 * stable: they are persisted in users' Profiles.
 */
export const VOCAB = {
  yesNo: ['yes', 'no'],
  phoneType: ['mobile', 'home', 'work'],
  /** Sponsorship per country: Yes, No, or Ask me each time (design.md "Country-specific answers"). */
  sponsorship: ['yes', 'no', 'ask'],
  workModel: ['onsite', 'hybrid', 'remote'],
  noticeUnit: ['days', 'weeks', 'months'],
  salaryPeriod: ['year', 'month', 'hour'],
  degreeLevel: ['highSchool', 'associate', 'bachelor', 'master', 'doctorate', 'other'],
  languageProficiency: ['elementary', 'limitedWorking', 'professionalWorking', 'fullProfessional', 'native'],

  // Self-ID vocabularies. Every one includes "decline", which is the default.
  usSex: ['female', 'male', 'nonBinary', 'decline'],
  usHispanicLatino: ['yes', 'no', 'decline'],
  /** EEO-1 race categories. */
  usRace: [
    'americanIndianOrAlaskaNative',
    'asian',
    'blackOrAfricanAmerican',
    'nativeHawaiianOrPacificIslander',
    'white',
    'twoOrMoreRaces',
    'decline',
  ],
  /** The three pre-offer options in 41 CFR 60-300 App. B. */
  usVeteran: ['protectedVeteran', 'notProtectedVeteran', 'decline'],
  usDisability: ['yes', 'no', 'decline'],
  caGenderIdentity: ['woman', 'man', 'nonBinary', 'twoSpirit', 'decline'],
  caIndigenous: ['firstNations', 'metis', 'inuit', 'no', 'decline'],
  caVisibleMinority: ['yes', 'no', 'decline'],
  caDisability: ['yes', 'no', 'decline'],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type VocabId = keyof typeof VOCAB;
export type VocabValue<V extends VocabId> = (typeof VOCAB)[V][number];
