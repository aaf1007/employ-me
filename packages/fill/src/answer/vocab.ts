import type { VocabId } from '@employ-me/core';
import type { OptionTarget } from '../match';

// How forms word each canonical vocab value (core taxonomy/vocab.ts). The
// patterns run on normalized option text: lower case, punctuation turned to
// spaces, apostrophes dropped ("don't" → "dont").

const DECLINE: OptionTarget = {
  text: 'Decline to self-identify',
  patterns: [
    /\b(decline|declined)\b/,
    /\b(prefer|preferring|rather) not\b/,
    /\b(do not|dont|not|no) (wish|want|care) to\b/,
    /\bchoose not\b|\bwish not to\b|\bnot to (say|answer|disclose|identify|self identify|specify)\b/,
    /\bi do not want to answer\b|\bprefer to not\b/,
  ],
  fuzzy: false,
};

const YES: OptionTarget = {
  text: 'Yes',
  patterns: [/^(yes|y|true|oui)\b/, /^i (am|do|have|will|would|can|identify)\b(?! not)(?! dont)/],
  fuzzy: false,
};

const NO: OptionTarget = {
  text: 'No',
  patterns: [
    /^(no|n|false|non)\b/,
    /^i (am not|do not|dont|have not|havent|will not|wont|would not|cannot|cant|do not identify)\b/,
    /\bnot (a|an) \w+$/,
  ],
  fuzzy: false,
};

export function yesNoTarget(yes: boolean): OptionTarget {
  return yes ? YES : NO;
}

const t = (text: string, ...patterns: RegExp[]): OptionTarget => ({ text, patterns, fuzzy: false });

const TARGETS: { readonly [V in VocabId]?: Readonly<Record<string, OptionTarget>> } = {
  usSex: {
    female: t('Female', /^(female|woman|women)\b/),
    male: t('Male', /^(male|man|men)\b/),
    nonBinary: t('Non-binary', /\bnon ?binary\b/),
    decline: DECLINE,
  },
  usHispanicLatino: {
    yes: t('Yes', ...YES.patterns, /^hispanic or latin[oax]\b/),
    no: t('No', ...NO.patterns, /\bnot hispanic\b/),
    decline: DECLINE,
  },
  usRace: {
    americanIndianOrAlaskaNative: t(
      'American Indian or Alaska Native',
      /\bamerican indian\b|\balaska(n)? native\b/,
    ),
    asian: t('Asian', /^asian\b(?! british)/, /^asian\b/),
    blackOrAfricanAmerican: t('Black or African American', /\bblack\b|\bafrican american\b/),
    nativeHawaiianOrPacificIslander: t(
      'Native Hawaiian or Other Pacific Islander',
      /\bnative hawaiian\b|\bpacific islander\b/,
    ),
    white: t('White', /^white\b/),
    twoOrMoreRaces: t('Two or More Races', /\btwo or more\b|\bmultiracial\b|\bmulti racial\b/),
    decline: DECLINE,
  },
  usVeteran: {
    protectedVeteran: t(
      'I identify as one or more of the classifications of protected veteran',
      /^i identify as (one or more|a protected)\b/,
      /^(yes|i am a protected veteran)\b/,
    ),
    notProtectedVeteran: t(
      'I am not a protected veteran',
      /\bnot a protected veteran\b/,
      /^i am not a veteran\b/,
      /^no\b/,
    ),
    decline: DECLINE,
  },
  usDisability: {
    yes: t('Yes, I have a disability', /^yes\b/),
    no: t('No, I do not have a disability', /^no\b/, /\bdo not have a disability\b/),
    decline: DECLINE,
  },
  caGenderIdentity: {
    woman: t('Woman', /^(woman|female|women)\b/),
    man: t('Man', /^(man|male|men)\b/),
    nonBinary: t('Non-binary', /\bnon ?binary\b/),
    twoSpirit: t('Two-Spirit', /\btwo ?spirit(ed)?\b/),
    decline: DECLINE,
  },
  caIndigenous: {
    firstNations: t('First Nations', /\bfirst nations?\b/, /^yes\b/),
    metis: t('Métis', /\bm[eé]tis\b/, /^yes\b/),
    inuit: t('Inuit', /\binuk\b|\binuit\b/, /^yes\b/),
    no: t('No', ...NO.patterns, /\bnot (an )?indigenous\b|\bnon indigenous\b/),
    decline: DECLINE,
  },
  caVisibleMinority: { yes: YES, no: NO, decline: DECLINE },
  caDisability: { yes: YES, no: NO, decline: DECLINE },
  phoneType: {
    mobile: t('Mobile', /\b(mobile|cell)\b/),
    home: t('Home', /\bhome\b/),
    work: t('Work', /\bwork\b/),
  },
  degreeLevel: {
    highSchool: t('High School', /\bhigh school\b|\bsecondary\b/),
    associate: t('Associate', /\bassociate\b/),
    bachelor: t("Bachelor's Degree", /\bbachelor\w*\b/, /\b(bsc|bs|ba|beng|bmath|undergraduate)\b/),
    master: t("Master's Degree", /\bmaster\w*\b/, /\b(msc|ms|ma|meng|mba)\b/),
    doctorate: t('Doctorate', /\b(doctor\w*|phd|ph d)\b/),
    other: t('Other', /^other\b/),
  },
};

/** The option target for a canonical vocab value, e.g. ("usRace", "asian") → "Asian". */
export function vocabTarget(vocab: VocabId, value: string): OptionTarget | null {
  return TARGETS[vocab]?.[value] ?? null;
}

export const DECLINE_TARGET = DECLINE;
