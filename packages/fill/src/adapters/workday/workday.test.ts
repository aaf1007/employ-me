import { profileSchema } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import caApply from '../../../../../fixtures/workday/synthetic-ca-apply.html?raw';
import signIn from '../../../../../fixtures/workday/synthetic-sign-in.html?raw';
import usApply from '../../../../../fixtures/workday/synthetic-us-apply.html?raw';
import { chooseButtonOption, pressAddAnother, setChecked } from '../../act';
import { plan, type FillPlan } from '../../plan';
import { loadPage, render } from '../../test-support/dom';
import { adapterFor } from '../index';
import { workdayAdapter } from './index';

// The Workday adapter over the synthetic fixtures (fixtures/workday/), which
// are hand-built from Workday's public bundles: unverified until a live pass.

const US_APPLY = new URL(
  'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825/apply/applyManually',
);
const CA_APPLY = new URL(
  'https://rbc.wd3.myworkdayjobs.com/en-US/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1/apply/applyManually',
);

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' }, preferredName: { first: 'Sammy' } },
  contact: {
    email: 'sam.lee@example.com',
    phone: { countryCode: '+1', number: '416 555 0123', type: 'mobile' },
  },
  address: { line1: '100 Queen St W', city: 'Toronto', region: 'ON', postalCode: 'M5H 2N2', country: 'CA' },
  countries: ['CA', 'US'],
  workAuthorization: {
    CA: { citizenships: ['CA'], authorizedNow: true, sponsorship: 'no' },
    US: { citizenships: ['CA'], authorizedNow: false, sponsorship: 'yes' },
  },
  background: {
    workHistory: [
      {
        id: 'w1',
        employer: 'Northwind Analytics',
        title: 'Software Engineer',
        startDate: '2023-05',
        current: true,
      },
      { id: 'w2', employer: 'Contoso Labs', title: 'Intern', startDate: '2022-01', endDate: '2022-08' },
    ],
  },
});

/** Shows one step page of a loaded fixture, as Workday's app would. */
function showStep(automationId: string): void {
  for (const page of document.querySelectorAll('[data-fixture-step]')) {
    page.toggleAttribute('hidden', page.getAttribute('data-automation-id') !== automationId);
  }
}

function summary(planned: FillPlan): Array<[string, string, string]> {
  return planned.fields.map((f) => [f.field.fieldId, f.fieldType, f.step.kind]);
}

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('Workday detection', () => {
  it.each([
    'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825',
    'https://wd1.myworkdaysite.com/en-US/recruiting/acme/External/job/Columbus-OH/Engineer_R123',
  ])('%s', (url) => {
    expect(adapterFor(new URL(url)).ats).toBe('workday');
  });

  it('finds the step on screen, or the sign-in panel, and nothing on a posting page', () => {
    loadPage(usApply);
    expect(workdayAdapter.findForm(document)?.getAttribute('data-automation-id')).toBe('applyFlowMyInfoPage');
    showStep('applyFlowReviewPage');
    expect(workdayAdapter.findForm(document)?.getAttribute('data-automation-id')).toBe('applyFlowReviewPage');
    loadPage(signIn);
    expect(workdayAdapter.findForm(document)?.getAttribute('data-automation-id')).toBe('signInContent');
    render(
      '<h2 data-automation-id="jobPostingHeader">Engineer</h2><a data-automation-id="adventureButton">Apply</a>',
    );
    expect(workdayAdapter.findForm(document)).toBeNull();
  });
});

describe('My Information', () => {
  it('current naming: stable ids from the field paths, and the right types', () => {
    loadPage(usApply);
    expect(summary(plan(document, profile, [], { url: US_APPLY }))).toEqual([
      ['source--source', 'screening.howHeard', 'skip'],
      ['previousWorker--candidateIsPreviousWorker', 'screening.workedHereBefore', 'review'],
      ['country--country', 'address.country', 'write'],
      ['name--legalName--firstName', 'name.first', 'write'],
      ['name--legalName--middleName', 'name.middle', 'skip'],
      ['name--legalName--lastName', 'name.last', 'write'],
      ['name--preferredCheck', 'name.preferred', 'write'],
      ['address--addressLine1', 'address.line1', 'write'],
      ['address--city', 'address.city', 'write'],
      ['address--countryRegion', 'address.region', 'write'],
      ['address--postalCode', 'address.postalCode', 'write'],
      ['emailAddress--emailAddress', 'contact.email', 'write'],
      ['phoneNumber--phoneType', 'phone.type', 'write'],
      ['phoneNumber--countryPhoneCode', 'phone.countryCode', 'write'],
      ['phoneNumber--phoneNumber', 'phone.number', 'write'],
      ['phoneNumber--extension', 'unknown', 'awaitProvider'],
      ['phoneNumber--smsOptIn', 'attestation.consent', 'skip'],
    ]);
  });

  it('classic naming: data-automation-id names the control', () => {
    loadPage(caApply);
    const planned = plan(document, profile, [], { url: CA_APPLY });
    expect(planned.fields.map((f) => [f.field.fieldId, f.fieldType])).toEqual([
      ['sourcePrompt', 'screening.howHeard'],
      ['previousWorker', 'screening.workedHereBefore'],
      ['countryDropdown', 'address.country'],
      ['legalNameSection_firstName', 'name.first'],
      ['legalNameSection_lastName', 'name.last'],
      ['preferredNameCheckbox', 'name.preferred'],
      ['addressSection_addressLine1', 'address.line1'],
      ['addressSection_city', 'address.city'],
      ['addressSection_countryRegion', 'address.region'],
      ['addressSection_postalCode', 'address.postalCode'],
      ['email', 'contact.email'],
      ['phone-device-type', 'phone.type'],
      ['countryPhoneCode', 'phone.countryCode'],
      ['phone-number', 'phone.number'],
      ['phone-extension', 'unknown'],
    ]);
  });

  it('drives "Select One" buttons and prompts as comboboxes, typing to search', () => {
    loadPage(usApply);
    const fields = plan(document, profile, [], { url: US_APPLY }).fields;
    const widget = (id: string) => fields.find((f) => f.field.fieldId === id)?.field.widget;
    expect(widget('country--country')).toBe('combobox');
    expect(widget('phoneNumber--countryPhoneCode')).toBe('combobox');
    expect(workdayAdapter.typeToSearch).toBe(true);
    const code = document.getElementById('phoneNumber--countryPhoneCode');
    expect(code === null ? [] : workdayAdapter.comboboxChoices(code)).toEqual([
      'United States of America (+1)',
    ]);
  });
});

describe('My Experience', () => {
  it('numbers entries by position, not by Workday’s global counter, in both schemes', () => {
    render(`
      <div data-automation-id="applyFlowMyExpPage">
        <div role="group" aria-labelledby="we"><h3 id="we">Work Experience</h3>
          <div data-automation-id="workExperience-23">
            <label for="workExperience-23--jobTitle">Job Title</label><input id="workExperience-23--jobTitle">
            <div data-automation-id="formField-startDate"><label>From</label>
              <input id="workExperience-23--startDate-dateSectionMonth-input" data-automation-id="dateSectionMonth-input" role="spinbutton" aria-valuemax="12">
              <input id="workExperience-23--startDate-dateSectionYear-input" data-automation-id="dateSectionYear-input" role="spinbutton">
            </div>
          </div>
          <div data-automation-id="workExperience-31">
            <label for="input-90">Job Title</label><input id="input-90" data-automation-id="jobTitle">
          </div>
          <button type="button" data-automation-id="add-button">Add Another</button>
        </div>
      </div>`);
    const planned = plan(document, profile, [], { url: US_APPLY });
    expect(planned.fields.map((f) => [f.field.fieldId, f.field.label, f.fieldType])).toEqual([
      ['workExperience--jobTitle--0', 'Job Title', 'work.title'],
      ['workExperience--startDate-month--0', 'From (Month)', 'work.startDate'],
      ['workExperience--startDate-year--0', 'From (Year)', 'work.startDate'],
      ['workExperience--jobTitle--1', 'Job Title', 'work.title'],
    ]);
    const writes = planned.fields.map((f) => (f.step.kind === 'write' ? f.step.write : null));
    expect(writes).toEqual([
      { kind: 'text', text: 'Software Engineer', check: 'exact' },
      { kind: 'text', text: '05', check: 'exact' },
      { kind: 'text', text: '2023', check: 'exact' },
      { kind: 'text', text: 'Intern', check: 'exact' },
    ]);
  });

  it('adds one entry per Profile entry, starting from none', () => {
    loadPage(usApply);
    showStep('applyFlowMyExpPage');
    const planned = plan(document, profile, [], { url: US_APPLY });
    expect(planned.repeats.map((r) => [r.section, r.have, r.want])).toEqual([['work', 0, 2]]);
    expect(planned.fields.map((f) => [f.field.fieldId, f.fieldType])).toEqual([
      ['skills', 'skill.list'],
      ['file-upload-input-ref', 'file.resume'],
      ['socialNetworkAccounts--linkedInAccount', 'link.linkedin'],
      ['socialNetworkAccounts--twitterAccount', 'unknown'],
      ['socialNetworkAccounts--facebookAccount', 'unknown'],
    ]);
  });
});

describe('Voluntary Disclosures and Self Identify', () => {
  it('leaves Self-ID to the Self-ID Answers and the terms box to the user', () => {
    loadPage(usApply);
    showStep('applyFlowVoluntaryDisclosuresPage');
    expect(summary(plan(document, profile, [], { url: US_APPLY }))).toEqual([
      ['personalInfoUS--gender', 'selfId.us.sex', 'write'],
      ['personalInfoUS--ethnicity', 'selfId.us.race', 'write'],
      ['personalInfoUS--veteranStatus', 'selfId.us.veteran', 'write'],
      ['termsAndConditions--acceptTermsAndAgreements', 'attestation.consent', 'skip'],
    ]);
  });

  it('never signs the disability form: its name and date are a signature', () => {
    loadPage(usApply);
    showStep('applyFlowSelfIdentifyPage');
    const planned = plan(document, profile, [], { url: US_APPLY });
    expect(summary(planned)).toEqual([
      ['selfIdentifiedDisabilityData--name', 'attestation.signature', 'skip'],
      ['selfIdentifiedDisabilityData--employeeId', 'selfId.other', 'skip'],
      ['selfIdentifiedDisabilityData--dateSignedOn-month', 'attestation.signature', 'skip'],
      ['selfIdentifiedDisabilityData--dateSignedOn-day', 'attestation.signature', 'skip'],
      ['selfIdentifiedDisabilityData--dateSignedOn-year', 'attestation.signature', 'skip'],
      ['selfIdentifiedDisabilityData--disabilityStatus', 'selfId.us.disability', 'write'],
    ]);
    const disability = planned.fields.at(-1)?.step;
    expect(disability).toMatchObject({ write: { kind: 'choose', labels: ['I do not want to answer'] } });
  });

  it('a Review step has nothing to fill', () => {
    loadPage(usApply);
    showStep('applyFlowReviewPage');
    expect(plan(document, profile, [], { url: US_APPLY }).fields).toEqual([]);
  });
});

describe('the sign-in page', () => {
  it('fills the email at most: never a password, never the terms', () => {
    loadPage(signIn);
    expect(
      plan(document, profile, [], { url: CA_APPLY }).fields.map((f) => [
        f.field.fieldId,
        f.fieldType,
        f.step.kind === 'skip' ? f.step.reason : f.step.kind,
      ]),
    ).toEqual([
      ['email', 'contact.email', 'write'],
      ['password', 'never.password', 'neverStored'],
      ['verifyPassword', 'never.password', 'neverStored'],
      ['createAccountCheckbox', 'attestation.consent', 'attestation'],
    ]);
  });
});

describe('act/ refuses Workday’s own buttons', () => {
  it.each([
    [
      'Save and Continue',
      '<button type="button" data-automation-id="pageFooterNextButton">Save and Continue</button>',
    ],
    ['Next', '<button type="button" data-automation-id="pageFooterNextButton">Next</button>'],
    ['Submit', '<button type="button" data-automation-id="pageFooterNextButton">Submit</button>'],
    [
      'old footer',
      '<button type="button" data-automation-id="bottom-navigation-next-button">Continue</button>',
    ],
    [
      'Create Account',
      '<form><button type="submit" data-automation-id="createAccountSubmitButton">Create Account</button></form>',
    ],
    [
      'Sign In',
      '<form><button type="submit" data-automation-id="signInSubmitButton">Sign In</button></form>',
    ],
    [
      'click filter',
      '<div role="button" tabindex="0" data-automation-id="click_filter" aria-label="Sign In"></div>',
    ],
    ['Apply', '<a href="#" role="button" data-automation-id="adventureButton">Apply</a>'],
    ['Apply Manually', '<button type="button" data-automation-id="applyManually">Apply Manually</button>'],
    [
      'Autofill with Resume',
      '<button type="button" data-automation-id="autofillWithResume">Autofill with Resume</button>',
    ],
    [
      'Use My Last Application',
      '<button type="button" data-automation-id="useMyLastApplication">Use My Last Application</button>',
    ],
  ])('%s', async (_name, html) => {
    render(html);
    const button = document.querySelector('button, [role="button"]');
    if (button === null) throw new Error('fixture needs a button');
    for (const result of [
      await pressAddAnother(button),
      await chooseButtonOption(button, { fieldType: 'unknown' }),
      await setChecked(button, true, { fieldType: 'unknown' }),
    ]) {
      expect(result.ok).toBe(false);
    }
  });

  it('but presses "Add" in a panel set', async () => {
    render(
      '<button type="button" data-automation-id="add-button" aria-label="Add Work Experience">Add</button>',
    );
    const add = document.querySelector('button');
    expect(add === null ? null : (await pressAddAnother(add)).ok).toBe(true);
  });
});
