import type { ControlKind, FieldType } from '@employ-me/core';

// The taxonomy rules: regexes and synonyms over normalized labels (lower
// case, punctuation turned to spaces), tried in order. First match wins, so
// specific rules come before general ones ("preferred first name" before
// "first name", "github" before "website"). English only (design.md "Tech").

interface Rule {
  readonly fieldType: FieldType;
  readonly test: RegExp;
  /** Limits a rule to some controls, e.g. "resume" only on file inputs. */
  readonly controls?: readonly ControlKind[];
  readonly not?: RegExp;
}

/** Languages a question may ask about by name ("Do you speak Greek at a native level?"). */
export const LANGUAGES =
  'english|french|german|spanish|greek|italian|portuguese|dutch|mandarin|cantonese|chinese|japanese|korean|arabic|hindi|polish|swedish|danish|norwegian|finnish|turkish|russian|hebrew';

const CHOICE: readonly ControlKind[] = ['select', 'combobox', 'radioGroup', 'checkbox', 'checkboxGroup'];
const TEXTY: readonly ControlKind[] = [
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'textarea',
  'combobox',
];

const RULES: readonly Rule[] = [
  { fieldType: 'file.resume', test: /\b(resume|cv|curriculum vitae)\b/, controls: ['file'] },
  { fieldType: 'file.coverLetter', test: /\bcover ?letter\b/, controls: ['file'] },
  { fieldType: 'freeText.coverLetter', test: /\bcover ?letter\b/, controls: ['textarea', 'text'] },

  {
    fieldType: 'name.preferred',
    test: /\b(preferred|nick ?name|chosen|known as|goes by)\b.*\bname\b|\bpreferred name\b|\bwhat (would|should) we call you\b/,
  },
  { fieldType: 'name.first', test: /\b(first|given|fore) ?name\b/ },
  { fieldType: 'name.last', test: /\b(last|family|sur) ?name\b|\bsurname\b/ },
  { fieldType: 'name.middle', test: /\bmiddle (name|initial)\b/ },
  {
    fieldType: 'name.full',
    test: /^(your |full |legal |candidate )*name$|\bfull (legal )?name\b|\blegal name\b/,
    not: /pronunc/,
  },

  {
    fieldType: 'contact.email',
    test: /\be ?mail\b/,
    // A question that mentions email in passing ("you'll receive an email from…") isn't asking for yours.
    controls: ['text', 'email', 'combobox'],
    not: /\b(newsletter|updates|alerts|marketing)\b|\b(receive|get|send|sent)\b.*\be ?mail\b|\b(via|by) e ?mail\b/,
  },
  { fieldType: 'phone.type', test: /\bphone (number )?type\b/ },
  { fieldType: 'phone.countryCode', test: /\b(country|dial(ling)?|calling) code\b/ },
  { fieldType: 'phone.full', test: /\b(phone|mobile|cell|telephone)( number)?\b/ },

  {
    fieldType: 'workAuth.usPerson',
    test: /\bu s person\b|\bexport control\w*\b|\bitar\b/,
    // "For export control, please list any countries of which you are a citizen" asks for your citizenships.
    not: /\b(list|name|which|what)\b.*\bcountries\b.*\bcitizen\w*\b|\bcountries of (citizenship|nationality)\b/,
  },
  {
    fieldType: 'workAuth.sponsorship',
    test: /\bsponsor\w*\b|\b(require|need)\w* (an? )?(employment |work )?visa\b|\bimmigration (support|assistance)\b/,
  },
  {
    fieldType: 'workAuth.authorized',
    test: /\b(authori[sz]ed|eligible|entitled|permitted|allowed|right) to work\b|\bwork (permit|authori[sz]ation|eligibility)\b|\bvalid (visa|work permit)\b|\bright to work\b|\blegally (eligible|able|authori[sz]ed)\b/,
  },
  { fieldType: 'workAuth.citizenship', test: /\b(citizen(ship)?|nationality)\b/ },
  {
    fieldType: 'identity.over18',
    test: /\b(18|eighteen) (years|yrs)\b|\bover (the age of )?18\b|\bat least 18\b|\bof legal (working )?age\b/,
  },

  { fieldType: 'link.linkedin', test: /\blinked ?in\b/ },
  { fieldType: 'link.github', test: /\bgit ?hub\b/ },
  { fieldType: 'link.other', test: /\bother (website|web site|url|link)s?\b/, controls: TEXTY },
  { fieldType: 'link.portfolio', test: /\b(portfolio|personal (website|site|page)|website|web site|blog)\b/ },
  { fieldType: 'link.other', test: /\b(url|link|profile link)\b/, controls: TEXTY },

  { fieldType: 'address.country', test: /\bcountry of residence\b|^(what is )?(your )?(current )?country$/ },
  {
    fieldType: 'address.location',
    test: /\blocation\b|\bwhere are you (currently )?(located|based)\b|\bcurrently located\b|\bare you (currently )?(located|based|living|residing) in\b|\bcity (?:(?:and|&) )?(state|country|province)\b|\bwhere do you (currently )?live\b|\bpermanently reside\b/,
    not: /\b(office|relocat\w*)\b/,
  },
  { fieldType: 'address.line2', test: /\b(address line 2|address 2|apartment|apt|suite|unit)\b/ },
  {
    fieldType: 'address.line1',
    test: /\b(street|address line 1|address 1|home address|mailing address|street address)\b|^address$/,
  },
  { fieldType: 'address.postalCode', test: /\b(zip|postal) ?code\b|\bpostcode\b|^zip$/ },
  {
    fieldType: 'address.region',
    test: /\bprovince\b|\bstate (or|and|\/)? ?(province|region)\b|\bstate of residence\b|^(your )?(state|region|territory)$/,
  },
  { fieldType: 'address.city', test: /\bcity\b|\btown\b/ },
  { fieldType: 'address.country', test: /^(your |home |current )?country$/ },

  {
    fieldType: 'pref.relocation',
    test: /\breloca\w*\b/,
    not: /^(what|where|which|please|provide|list|describe|if)\b/,
  },
  {
    fieldType: 'pref.workModel',
    test: /\b(remote|hybrid|on ?site|in office|in person|onsite)\b|\bwork (model|arrangement|location preference)\b|\b(days|times) (a|per) week\b.*\boffices?\b|\boffices?\b.*\b(days|times) (a|per) week\b/,
  },
  {
    fieldType: 'pref.noticePeriod',
    test: /\bnotice period\b|\bnotice\b.*\b(give|required|current employer)\b/,
  },
  {
    fieldType: 'pref.startDate',
    test: /\bstart date\b|\bearliest\b.*\b(start|date)\b|\bwhen (can|could|would) you (start|begin|join)\b|\bavailable to (start|begin|onboard|join)\b|\bavailability\b|\bstart working\b|\bstart a new role\b/,
  },
  {
    fieldType: 'pref.salary',
    test: /\b(salary|compensation|pay|remuneration|wage)\b.*\b(expect\w*|requirement\w*|desired|range|looking for)\b|\b(expected|desired|target) (salary|compensation|pay)\b/,
  },

  {
    fieldType: 'screening.nonCompete',
    test: /\bnon ?compet\w*\b|\bnon ?solicit\w*\b|\bpost employment restrictions?\b|\brestrictive covenants?\b/,
  },
  {
    fieldType: 'work.currentTitle',
    test: /\b(current|most recent|present|latest)\b.*\b(job )?(title|position|role)\b/,
  },
  {
    fieldType: 'work.currentEmployer',
    test: /\b(current|most recent|present|latest)\b.*\b(company|employer|organi[sz]ation)\b|^company( name)?$|^employer$/,
  },

  { fieldType: 'edu.gpa', test: /\bgpa\b|\bgrade point\b/ },
  {
    fieldType: 'edu.endDate',
    test: /\bgraduat\w* (date|year)\b|\b(expected|anticipated) graduation\b|\bgrad date\b|\bwhen (will|did) you graduate\b/,
  },
  { fieldType: 'edu.degree', test: /\bdegree\b/ },
  { fieldType: 'edu.discipline', test: /\b(discipline|major|field of study|area of study|concentration)\b/ },
  {
    fieldType: 'edu.school',
    test: /\b(school|university|college|institution)\b/,
    // "Years of post-college work experience" asks about work, not a school.
    not: /\bhigh school diploma\b|\b(years?|experience)\b/,
  },

  { fieldType: 'screening.backgroundCheck', test: /\bbackground (check|screening|investigation)\b/ },
  {
    fieldType: 'screening.workedHereBefore',
    test: /\b(previously|ever|before|formerly) (been )?(employed|worked)\b|\bworked (at|for) [a-z0-9 ]+ (before|previously)\b|\bformer employee\b|\bpreviously employed\b/,
  },
  {
    fieldType: 'screening.referred',
    test: /\b(were|have) you (been )?referred\b|\breferred (by|to us)\b|\bemployee referral\b|\breferral\b/,
    not: /\bhow did you\b/,
  },
  {
    fieldType: 'screening.howHeard',
    test: /\bhow did you (hear|find|learn|come across)\b|\bwhere did you (hear|find|learn|see)\b|\bhow .*\b(hear|heard|learn|learned|learnt) about\b|^source$|\breferral source\b/,
  },

  {
    fieldType: 'language.proficiency',
    test: new RegExp(
      `\\b(do you speak|speak|fluen\\w*|proficien\\w*|native|level)\\b.*\\b(${LANGUAGES})\\b|\\b(${LANGUAGES})\\b.*\\b(fluen\\w*|proficien\\w*|native|level)\\b`,
    ),
  },
  { fieldType: 'language.name', test: /\blanguages?\b/, controls: CHOICE },

  { fieldType: 'skill.list', test: /\bskills\b/, controls: [...TEXTY, ...CHOICE] },
];

export function ruleFor(label: string, control: ControlKind): FieldType | null {
  for (const rule of RULES) {
    if (rule.controls !== undefined && !rule.controls.includes(control)) continue;
    if (rule.not?.test(label) === true) continue;
    if (rule.test.test(label)) return rule.fieldType;
  }
  return null;
}

/** HTML autocomplete tokens (WHATWG "autofill field names") to field types. */
const AUTOCOMPLETE: Readonly<Record<string, FieldType>> = {
  name: 'name.full',
  'given-name': 'name.first',
  'additional-name': 'name.middle',
  'family-name': 'name.last',
  nickname: 'name.preferred',
  email: 'contact.email',
  tel: 'phone.full',
  'tel-national': 'phone.number',
  'tel-country-code': 'phone.countryCode',
  'street-address': 'address.line1',
  'address-line1': 'address.line1',
  'address-line2': 'address.line2',
  'address-level2': 'address.city',
  'address-level1': 'address.region',
  'postal-code': 'address.postalCode',
  country: 'address.country',
  'country-name': 'address.country',
  organization: 'work.currentEmployer',
  'organization-title': 'work.currentTitle',
  bday: 'never.dateOfBirth',
  'bday-day': 'never.dateOfBirth',
  'bday-month': 'never.dateOfBirth',
  'bday-year': 'never.dateOfBirth',
  'new-password': 'never.password',
  'current-password': 'never.password',
  'one-time-code': 'never.password',
};

/** The field type an `autocomplete` attribute names, ignoring section-*, shipping/billing and on/off. */
export function autocompleteType(token: string | undefined): FieldType | null {
  if (token === undefined) return null;
  const parts = token.toLowerCase().trim().split(/\s+/);
  const last = parts[parts.length - 1];
  return last === undefined ? null : (AUTOCOMPLETE[last] ?? null);
}
