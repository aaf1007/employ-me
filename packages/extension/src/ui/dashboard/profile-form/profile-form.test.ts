import { describe, expect, it } from 'vitest';
import { SAMPLE_RESUME_EXTRACT } from '../../../helper';
import { emptyProfileFields } from '../../../storage';
import { applyExtract } from './extract';
import { errorsUnder, validateForm } from './from-form';
import { BLANK_WORK_AUTHORIZATION, blankWork, toForm } from './to-form';
import type { ProfileForm } from './types';

const empty = (): ProfileForm => toForm(emptyProfileFields());
let ids = 0;
const newId = () => `new-${String(++ids)}`;

describe('Profile form', () => {
  it('saves an untouched form as an empty Profile, every Self-ID Answer declined', () => {
    const result = validateForm(empty());
    expect(result.ok && result.fields).toEqual(emptyProfileFields());
  });

  it('round-trips a full Profile through the form unchanged', () => {
    const filled = applyExtract(empty(), SAMPLE_RESUME_EXTRACT, newId).form;
    const form: ProfileForm = {
      ...filled,
      identity: { ...filled.identity, over18: 'yes' },
      // Resumes rarely give a street; core's address needs one.
      address: { ...filled.address, line1: '1 Example St', postalCode: 'M5V 0A1' },
      countries: ['US', 'CA'],
      workAuthorization: {
        US: {
          ...BLANK_WORK_AUTHORIZATION,
          authorizedNow: 'no',
          sponsorship: 'ask',
          status: 'TN eligible',
          usPerson: 'no',
        },
        CA: { ...BLANK_WORK_AUTHORIZATION, authorizedNow: 'yes', sponsorship: 'no', citizenships: ['CA'] },
      },
      salary: {
        US: { min: '150000', max: '180000', period: 'year' },
        CA: { min: '120000', max: '', period: 'year' },
      },
      preferences: {
        relocation: 'yes',
        workModels: ['remote', 'hybrid'],
        startDate: '2027-01-04',
        noticeAmount: '2',
        noticeUnit: 'weeks',
      },
      screening: {
        howHeard: 'LinkedIn',
        referred: 'no',
        backgroundCheck: 'yes',
        nonCompete: 'no',
        workedHereBefore: [{ employer: 'Acme', workedHere: 'yes' }],
      },
      selfId: { ...filled.selfId, US: { ...filled.selfId.US, veteran: 'notProtectedVeteran' } },
    };
    const first = validateForm(form);
    if (!first.ok) expect.fail(JSON.stringify(first.errors));
    expect(first.fields.preferences.salary).toEqual({
      US: { currency: 'USD', min: 150000, max: 180000, period: 'year' },
      CA: { currency: 'CAD', min: 120000, period: 'year' },
    });
    expect(first.fields.workAuthorization['US']).toMatchObject({ sponsorship: 'ask', usPerson: false });
    expect(first.fields.workAuthorization['CA']).not.toHaveProperty('usPerson');
    expect(first.fields.screening.workedHereBefore).toEqual({ acme: true });

    const again = validateForm(toForm(first.fields));
    expect(again.ok && again.fields).toEqual(first.fields);
  });

  it('keeps only ticked countries’ Work Authorization and salary', () => {
    const form: ProfileForm = {
      ...empty(),
      countries: ['CA'],
      workAuthorization: {
        CA: { ...BLANK_WORK_AUTHORIZATION, authorizedNow: 'yes', sponsorship: 'no' },
        US: { ...BLANK_WORK_AUTHORIZATION, authorizedNow: 'no', sponsorship: 'yes' },
      },
      salary: { US: { min: '1', max: '', period: 'year' } },
    };
    const result = validateForm(form);
    expect(result.ok && Object.keys(result.fields.workAuthorization)).toEqual(['CA']);
    expect(result.ok && result.fields.preferences.salary).toEqual({});
  });

  it('reports errors at the inputs’ paths', () => {
    const form: ProfileForm = {
      ...empty(),
      identity: { ...empty().identity, legalFirst: 'Sam' },
      contact: { email: 'nope', phoneCountryCode: '1', phoneNumber: '555 0100', phoneType: '' },
      countries: ['CA'],
      workAuthorization: { CA: { ...BLANK_WORK_AUTHORIZATION, authorizedNow: 'yes' } },
      salary: { CA: { min: 'lots', max: '', period: 'year' } },
      workHistory: [{ ...blankWork('w1'), employer: 'Acme' }],
    };
    const result = validateForm(form);
    if (result.ok) expect.fail('expected errors');
    expect(result.errors).toMatchObject({
      'identity.legalName.last': 'Required',
      'contact.email': 'Enter an email address, like sam@example.com',
      'contact.phone.type': 'Choose one of the options',
      'workAuthorization.CA.sponsorship': 'Choose one of the options',
      'preferences.salary.CA.min': 'Enter a number',
      'background.workHistory.0.title': 'Required',
    });
    // "1" was read as the calling code +1.
    expect(result.errors).not.toHaveProperty('contact.phone.countryCode');
    expect(Object.keys(errorsUnder(result.errors, ['identity', 'contact']))).toEqual([
      'identity.legalName.last',
      'contact.email',
      'contact.phone.type',
    ]);
  });

  it('pre-fills only blank fields from a Resume and says which', () => {
    const typed: ProfileForm = { ...empty(), identity: { ...empty().identity, legalFirst: 'Samantha' } };
    const { form, paths } = applyExtract(typed, SAMPLE_RESUME_EXTRACT, newId);
    expect(form.identity.legalFirst).toBe('Samantha');
    expect(form.identity.legalLast).toBe('Lee');
    expect(form.workHistory[0]).toMatchObject({ employer: 'Example Corp', current: true });
    expect(form.workHistory[0]?.id).toMatch(/^new-/);
    expect(paths).toContain('identity.legalName.last');
    expect(paths).not.toContain('identity.legalName.first');
    expect(paths).toEqual(
      expect.arrayContaining(['contact.email', 'background.workHistory', 'contact.phone.type']),
    );

    // Running it again changes nothing.
    expect(applyExtract(form, SAMPLE_RESUME_EXTRACT, newId)).toEqual({ form, paths: [] });
  });
});
