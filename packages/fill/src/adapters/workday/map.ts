import type { FieldType } from '@employ-me/core';
import type { ExtractedField } from '../../types';
import { keyOfFieldId } from './fields';

// The adapter map (research §6 step 3), by field key in both naming schemes.
// Self-ID questions are left to the rules on purpose: which Self-ID Answer a
// "Gender" question takes depends on the Posting's country. The disability
// form (CC-305) is the US federal one wherever it appears.

const MAP: Readonly<Record<string, FieldType>> = {
  // My Information, current scheme.
  'name--legalName--firstName': 'name.first',
  'name--legalName--middleName': 'name.middle',
  'name--legalName--lastName': 'name.last',
  'name--preferredCheck': 'name.preferred',
  'name--preferredName--firstName': 'name.preferred',
  'name--preferredName--lastName': 'name.last',
  'country--country': 'address.country',
  'address--addressLine1': 'address.line1',
  'address--addressLine2': 'address.line2',
  'address--city': 'address.city',
  'address--countryRegion': 'address.region',
  'address--postalCode': 'address.postalCode',
  'emailAddress--emailAddress': 'contact.email',
  'phoneNumber--phoneType': 'phone.type',
  'phoneNumber--countryPhoneCode': 'phone.countryCode',
  'phoneNumber--phoneNumber': 'phone.number',
  // No Profile value: the rules would read "Phone Extension" as the whole number.
  'phoneNumber--extension': 'unknown',
  'source--source': 'screening.howHeard',
  'previousWorker--candidateIsPreviousWorker': 'screening.workedHereBefore',
  'socialNetworkAccounts--linkedInAccount': 'link.linkedin',
  'termsAndConditions--acceptTermsAndAgreements': 'attestation.consent',
  'selfIdentifiedDisabilityData--name': 'attestation.signature',
  'selfIdentifiedDisabilityData--dateSignedOn': 'attestation.signature',
  'selfIdentifiedDisabilityData--disabilityStatus': 'selfId.us.disability',

  // My Information, classic scheme.
  legalNameSection_firstName: 'name.first',
  legalNameSection_middleName: 'name.middle',
  legalNameSection_lastName: 'name.last',
  preferredNameCheckbox: 'name.preferred',
  preferredNameSection_firstName: 'name.preferred',
  preferredNameSection_lastName: 'name.last',
  countryDropdown: 'address.country',
  addressSection_addressLine1: 'address.line1',
  addressSection_addressLine2: 'address.line2',
  addressSection_city: 'address.city',
  addressSection_countryRegion: 'address.region',
  addressSection_postalCode: 'address.postalCode',
  email: 'contact.email',
  'phone-device-type': 'phone.type',
  countryPhoneCode: 'phone.countryCode',
  'phone-number': 'phone.number',
  'phone-extension': 'unknown',
  sourcePrompt: 'screening.howHeard',
  sourceDropdown: 'screening.howHeard',
  previousWorker: 'screening.workedHereBefore',
  agreementCheckbox: 'attestation.consent',
  createAccountCheckbox: 'attestation.consent',

  // My Experience: repeating entries, either scheme.
  'workExperience--jobTitle': 'work.title',
  'workExperience--companyName': 'work.employer',
  'workExperience--company': 'work.employer',
  'workExperience--location': 'work.location',
  'workExperience--currentlyWorkHere': 'work.current',
  'workExperience--startDate': 'work.startDate',
  'workExperience--endDate': 'work.endDate',
  'workExperience--roleDescription': 'work.description',
  'workExperience--description': 'work.description',
  'education--school': 'edu.school',
  'education--schoolName': 'edu.school',
  'education--degree': 'edu.degree',
  'education--fieldOfStudy': 'edu.discipline',
  'education--gradeAverage': 'edu.gpa',
  'education--gpa': 'edu.gpa',
  'education--firstYearAttended': 'edu.startDate',
  'education--lastYearAttended': 'edu.endDate',
  skills: 'skill.list',
};

/** The classic Self Identify page names its signature boxes plainly: "name", "dateSignedOn". */
const SELF_IDENTIFY: Readonly<Record<string, FieldType>> = {
  name: 'attestation.signature',
  dateSignedOn: 'attestation.signature',
  disabilityStatus: 'selfId.us.disability',
};

export function classify(field: ExtractedField): FieldType | null {
  const key = keyOfFieldId(field.fieldId);
  const known = MAP[key];
  if (known !== undefined) return known;
  if (field.element.closest('[data-automation-id="applyFlowSelfIdentifyPage"]') !== null) {
    return SELF_IDENTIFY[key] ?? null;
  }
  return null;
}
