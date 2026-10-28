import { z } from 'zod';
import type { VocabId } from './vocab';

/**
 * How a field type may be handled.
 * - ordinary: rules fill it; its label and options may go to a Provider.
 * - selfId: filled only from the user's own Self-ID Answers. Never sent to a Provider.
 * - attestation: never ticked or signed automatically. Never sent to a Provider.
 * - neverStored: things design.md says we never store (passwords, SIN/SSN, date
 *   of birth, references). Never filled, never sent.
 */
export type Sensitivity = 'ordinary' | 'selfId' | 'attestation' | 'neverStored';

export type AnswerKind =
  | 'text'
  | 'longText'
  | 'choice'
  | 'multiChoice'
  | 'yesNo'
  | 'date'
  | 'yearMonth'
  | 'number'
  | 'file'
  | 'none';

export interface FieldTypeSpec {
  readonly sensitivity: Sensitivity;
  readonly answer: AnswerKind;
  /** Canonical option values, for choice-like answers. */
  readonly vocab?: VocabId;
}

const ordinary = (answer: AnswerKind, vocab?: VocabId): FieldTypeSpec =>
  vocab === undefined ? { sensitivity: 'ordinary', answer } : { sensitivity: 'ordinary', answer, vocab };
const selfId = (vocab: VocabId): FieldTypeSpec => ({ sensitivity: 'selfId', answer: 'choice', vocab });
const attestation = (answer: AnswerKind): FieldTypeSpec => ({ sensitivity: 'attestation', answer });
const neverStored = (answer: AnswerKind): FieldTypeSpec => ({ sensitivity: 'neverStored', answer });
const spec = (s: FieldTypeSpec): FieldTypeSpec => s;

/**
 * The canonical field types the fill engine classifies every field into.
 * Names are `<group>.<field>`. Adding a type is cheap; renaming one breaks
 * caches and stored Snapshots, so don't.
 */
export const FIELD_TYPES = {
  'name.full': ordinary('text'),
  'name.first': ordinary('text'),
  'name.middle': ordinary('text'),
  'name.last': ordinary('text'),
  'name.preferred': ordinary('text'),
  'identity.over18': ordinary('yesNo'),

  'contact.email': ordinary('text'),
  'phone.full': ordinary('text'),
  'phone.countryCode': ordinary('choice'),
  'phone.number': ordinary('text'),
  'phone.type': ordinary('choice', 'phoneType'),

  'address.full': ordinary('longText'),
  'address.line1': ordinary('text'),
  'address.line2': ordinary('text'),
  'address.city': ordinary('text'),
  'address.region': ordinary('choice'),
  'address.postalCode': ordinary('text'),
  'address.country': ordinary('choice'),
  /** A single "Location" box: "Toronto, ON, Canada". */
  'address.location': ordinary('text'),

  'link.linkedin': ordinary('text'),
  'link.github': ordinary('text'),
  'link.portfolio': ordinary('text'),
  'link.other': ordinary('text'),

  'workAuth.authorized': ordinary('yesNo'),
  'workAuth.sponsorship': ordinary('yesNo'),
  'workAuth.status': ordinary('choice'),
  'workAuth.citizenship': ordinary('choice'),
  'workAuth.explanation': ordinary('longText'),
  'workAuth.usPerson': ordinary('yesNo'),

  'pref.relocation': ordinary('yesNo'),
  'pref.workModel': ordinary('multiChoice', 'workModel'),
  'pref.startDate': ordinary('date'),
  'pref.noticePeriod': ordinary('text'),
  'pref.salary': ordinary('text'),

  'work.currentEmployer': ordinary('text'),
  'work.currentTitle': ordinary('text'),
  'work.employer': ordinary('text'),
  'work.title': ordinary('text'),
  'work.location': ordinary('text'),
  'work.startDate': ordinary('yearMonth'),
  'work.endDate': ordinary('yearMonth'),
  'work.current': ordinary('yesNo'),
  'work.description': ordinary('longText'),

  'edu.school': ordinary('choice'),
  'edu.degree': ordinary('choice', 'degreeLevel'),
  'edu.discipline': ordinary('choice'),
  'edu.startDate': ordinary('yearMonth'),
  'edu.endDate': ordinary('yearMonth'),
  'edu.gpa': ordinary('text'),

  'skill.list': ordinary('multiChoice'),
  'language.name': ordinary('choice'),
  'language.proficiency': ordinary('choice', 'languageProficiency'),

  'file.resume': ordinary('file'),
  'file.coverLetter': ordinary('file'),

  'screening.howHeard': ordinary('choice'),
  'screening.referred': ordinary('yesNo'),
  'screening.workedHereBefore': ordinary('yesNo'),
  'screening.backgroundCheck': ordinary('yesNo'),
  'screening.nonCompete': ordinary('yesNo'),

  'selfId.us.sex': selfId('usSex'),
  'selfId.us.hispanicLatino': selfId('usHispanicLatino'),
  'selfId.us.race': selfId('usRace'),
  'selfId.us.veteran': selfId('usVeteran'),
  'selfId.us.disability': selfId('usDisability'),
  'selfId.ca.genderIdentity': selfId('caGenderIdentity'),
  'selfId.ca.indigenous': selfId('caIndigenous'),
  'selfId.ca.visibleMinority': selfId('caVisibleMinority'),
  'selfId.ca.disability': selfId('caDisability'),
  /** A voluntary self-identification question we have no stored answer type for. */
  'selfId.other': spec({ sensitivity: 'selfId', answer: 'choice' }),

  'attestation.certify': attestation('yesNo'),
  'attestation.consent': attestation('yesNo'),
  'attestation.aiPolicy': attestation('yesNo'),
  'attestation.signature': attestation('text'),
  'attestation.other': attestation('yesNo'),

  /** A free-text question that needs a Draft. */
  'freeText.question': ordinary('longText'),
  /** Left empty and flagged; the Draft button still works (design.md "Drafts"). */
  'freeText.coverLetter': ordinary('longText'),

  'never.password': neverStored('text'),
  'never.governmentId': neverStored('text'),
  'never.dateOfBirth': neverStored('date'),
  'never.reference': neverStored('longText'),

  unknown: ordinary('none'),
} as const satisfies Record<string, FieldTypeSpec>;

export type FieldType = keyof typeof FIELD_TYPES;

export const FIELD_TYPE_IDS = Object.keys(FIELD_TYPES) as [FieldType, ...FieldType[]];

export const fieldTypeSchema = z.enum(FIELD_TYPE_IDS);

export function sensitivityOf(fieldType: FieldType): Sensitivity {
  return FIELD_TYPES[fieldType].sensitivity;
}

/** Only ordinary field types may have their labels and options sent to a Provider. */
export function mayGoToProvider(fieldType: FieldType): boolean {
  return sensitivityOf(fieldType) === 'ordinary';
}
