import type { FieldType, SavedAnswer } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { render } from '../test-support/dom';
import type { ExtractedField, Widget } from '../types';
import { classifyField, type ClassifyContext, type CountryChoice } from './index';

function field(label: string, extra: Partial<ExtractedField> & { widget?: Widget } = {}): ExtractedField {
  render('<input id="x">');
  const element = document.getElementById('x');
  if (element === null) throw new Error('no element');
  return {
    fieldId: 'x',
    label,
    control: 'text',
    options: [],
    required: false,
    element,
    widget: 'text',
    choices: [],
    ...extra,
  };
}

const US: CountryChoice = { kind: 'known', country: 'US' };
const CA: CountryChoice = { kind: 'known', country: 'CA' };
const UNCLEAR: CountryChoice = { kind: 'unclear', candidates: ['DE', 'GB'] };

function context(country: CountryChoice = US, savedAnswers: SavedAnswer[] = []): ClassifyContext {
  return { ats: 'generic', url: new URL('https://example.com/apply'), savedAnswers, country };
}

const typeOf = (label: string, extra: Partial<ExtractedField> = {}, country: CountryChoice = US): FieldType =>
  classifyField(field(label, extra), context(country)).fieldType;

describe('the taxonomy rules', () => {
  it.each([
    ['First Name', 'name.first'],
    ['Preferred First Name', 'name.preferred'],
    ['Last Name', 'name.last'],
    ['Legal Name', 'name.full'],
    ['Email', 'contact.email'],
    ['Phone Number', 'phone.full'],
    ['LinkedIn Profile', 'link.linkedin'],
    ['Github / Website', 'link.github'],
    ['Other website', 'link.other'],
    ['Website', 'link.portfolio'],
    ['Current location', 'address.location'],
    ['City & Country in which you are currently located', 'address.location'],
    ['What is your country of residence?', 'address.country'],
    ['Please select your current province of residence.', 'address.region'],
    ['Are you legally entitled to work in Canada?', 'workAuth.authorized'],
    ['Will you now or in the future require sponsorship for employment visa status?', 'workAuth.sponsorship'],
    ['Do you have a valid visa/work permit for Germany?', 'workAuth.authorized'],
    ['Are you open to relocation for this role?', 'pref.relocation'],
    ['What is the address from which you plan on working? If you would need to relocate, tell us', 'unknown'],
    ['When is the earliest you would want to start working with us?', 'pref.startDate'],
    ['What is your notice period?', 'pref.noticePeriod'],
    ['What are your compensation expectations for the role?', 'pref.salary'],
    ['Current or Most Recent Job Title', 'work.currentTitle'],
    ['Current company', 'work.currentEmployer'],
    [
      'Are there any post-employment restrictions from your current or most recent employer?',
      'screening.nonCompete',
    ],
    ['How did you hear about this job opportunity?', 'screening.howHeard'],
    ['Please tell us how you heard about this opportunity.', 'screening.howHeard'],
    ['Have you ever worked at MongoDB before?', 'screening.workedHereBefore'],
    ['Will you consent to a background check?', 'screening.backgroundCheck'],
    ['Do you speak Greek at a native level ?', 'language.proficiency'],
    ['Are you eligible to obtain the security clearance? See https://state.gov for details', 'unknown'],
    ['Why do you want to work here?', 'unknown'],
  ] as const)('%s → %s', (label, expected) => {
    expect(typeOf(label)).toBe(expected);
  });

  it('sends long free-text questions to drafting', () => {
    expect(typeOf('Why Anthropic?', { widget: 'textarea', control: 'textarea' })).toBe('freeText.question');
  });

  it('files: Resume and cover letter', () => {
    expect(typeOf('Resume/CV', { widget: 'file', control: 'file' })).toBe('file.resume');
    expect(typeOf('Cover Letter', { widget: 'file', control: 'file' })).toBe('file.coverLetter');
  });

  it('prefers the visible label over a wrong autocomplete token', () => {
    expect(typeOf('First Name', { autocomplete: 'name' })).toBe('name.first');
    expect(typeOf('', { autocomplete: 'family-name' })).toBe('name.last');
  });

  it('reads a "Location" that asks for a country as a country', () => {
    expect(typeOf('Location', { description: "Country you're currently residing in" })).toBe(
      'address.country',
    );
  });
});

describe('Attestations and never-stored fields are found deterministically', () => {
  it.each([
    [
      'By checking this box, I consent to Geotab collecting, storing, and processing my responses',
      'attestation.consent',
    ],
    ['I agree to allow GetYourGuide to retain my data for future opportunities', 'attestation.consent'],
    ['Receive alerts for similar jobs?', 'attestation.consent'],
    ['AI Policy for Application', 'attestation.aiPolicy'],
    ['I hereby certify that I have not knowingly withheld any information', 'attestation.certify'],
    ['Agreement to Arbitrate', 'attestation.other'],
    ['Please read the arbitration agreement below', 'attestation.other'],
    ['Interview Recording Consent', 'attestation.consent'],
    ['Signature', 'attestation.signature'],
    ['Date of birth', 'never.dateOfBirth'],
    ['Social Insurance Number (SIN)', 'never.governmentId'],
    ['Professional references', 'never.reference'],
  ] as const)('%s → %s', (label, expected) => {
    expect(typeOf(label)).toBe(expected);
  });

  it('treats willingness as a fact, not an Attestation', () => {
    expect(typeOf('Do you consent to a background check?')).toBe('screening.backgroundCheck');
  });

  it('a talent pool mentioned in passing is not consent', () => {
    expect(typeOf('Province of residence. This information helps us understand our talent pool.')).toBe(
      'address.region',
    );
  });

  it('a password box is never stored', () => {
    render('<input id="p" type="password">');
    const element = document.getElementById('p');
    if (element === null) throw new Error('no element');
    expect(classifyField({ ...field('Password'), element }, context()).fieldType).toBe('never.password');
  });
});

describe('Self-ID questions follow the Posting country', () => {
  it.each([
    ['Gender', US, 'selfId.us.sex'],
    ['Gender Identity', CA, 'selfId.ca.genderIdentity'],
    ['Are you Hispanic/Latino?', US, 'selfId.us.hispanicLatino'],
    ['Please identify your race', US, 'selfId.us.race'],
    ['Veteran Status', US, 'selfId.us.veteran'],
    ['Do you self-identify as a racialized person?', CA, 'selfId.ca.visibleMinority'],
    [
      'Do you self-identify as an Indigenous person (First Nations, Métis, Inuit)?',
      CA,
      'selfId.ca.indigenous',
    ],
    ['Do you self-identify as a person with a disability?', CA, 'selfId.ca.disability'],
    // Topics a country keeps no answer for fill only "decline".
    ['I identify my ethnicity as (select all that apply):', CA, 'selfId.other'],
    ['If you are a veteran of the armed forces in your country', CA, 'selfId.other'],
    ['What are your pronouns?', US, 'selfId.other'],
  ] as const)('%s in %o → %s', (label, country, expected) => {
    expect(typeOf(label, {}, country)).toBe(expected);
  });

  it('a question in a Self-ID section is Self-ID, whatever it asks', () => {
    expect(typeOf('Which categories describe you?', { section: 'Canada Demographic Questions' })).toBe(
      'selfId.other',
    );
  });

  it('flags the country as unclear rather than guessing', () => {
    expect(classifyField(field('Gender'), context(UNCLEAR))).toMatchObject({
      fieldType: 'selfId.other',
      country: UNCLEAR,
    });
  });
});

describe('Work Authorization country', () => {
  it('uses the country a question names over the Posting country', () => {
    const result = classifyField(
      field('Are you legally authorized to work in the United States?'),
      context(CA),
    );
    expect(result).toMatchObject({ fieldType: 'workAuth.authorized', country: US });
  });

  it("uses the Posting's country otherwise", () => {
    const result = classifyField(
      field('Are you authorized to work in the country where the job is located?'),
      context(CA),
    );
    expect(result).toMatchObject({ country: CA });
  });
});

describe('Saved Answers', () => {
  const saved: SavedAnswer = {
    id: 's1',
    question: 'What frameworks/libraries are you most proficient in?',
    answer: 'React',
    employerOverrides: {},
    source: 'manual',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
  };

  it('match word for word, ignoring case and punctuation', () => {
    const result = classifyField(
      field('what frameworks / libraries are you MOST proficient in', {
        widget: 'textarea',
        control: 'textarea',
      }),
      context(US, [saved]),
    );
    expect(result).toMatchObject({
      fieldType: 'freeText.question',
      source: 'savedAnswer',
      savedAnswerId: 's1',
    });
  });

  it('never answer a Self-ID or Attestation question', () => {
    const consent = { ...saved, question: 'I consent to the processing of my data' };
    expect(classifyField(field(consent.question), context(US, [consent])).fieldType).toBe(
      'attestation.consent',
    );
  });
});
