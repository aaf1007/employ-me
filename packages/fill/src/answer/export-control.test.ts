import { profileSchema } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { plan } from '../plan';
import { render } from '../test-support/dom';

// Export-control questions, from the live test of 2026-10-28 (docs/live-test).
// Both ended as "No option matches your Profile".

const canadian = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
  address: { line1: '1 Example Ave', city: 'Vancouver', region: 'BC', country: 'CA' },
  workAuthorization: {
    CA: { citizenships: ['CA'], authorizedNow: true, sponsorship: 'no' },
    US: { citizenships: ['CA'], authorizedNow: false, sponsorship: 'yes', usPerson: false },
  },
});

const URL_US = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');

beforeEach(() => {
  document.body.innerHTML = '';
});

function form(html: string): void {
  render(`<form id="application-form">${html}<button type="submit">Submit application</button></form>`);
}

// Databricks (Greenhouse embed). The second question's options say "other than Cuba…", so it isn't read as a list.
const SANCTIONS = `
  <fieldset><legend>Please confirm whether any of the below applies to you. Select all that apply. Note: This information will only be used to ensure compliance with U.S. sanctions and export controls.</legend>
    <label><input type="checkbox" name="s[]" value="1"> Citizen or permanent resident of Cuba, Iran, North Korea, or Syria</label>
    <label><input type="checkbox" name="s[]" value="2"> Ordinarily a resident of Cuba, Iran, North Korea, Syria or the Crimea, Donetsk, Luhansk, Zaporizhzhia, or Kherson regions of Ukraine</label>
    <label><input type="checkbox" name="s[]" value="3"> Ordinarily a resident of Russia or Belarus and not willing to relocate for a Databricks role</label>
    <label><input type="checkbox" name="s[]" value="4"> None of the above</label>
  </fieldset>`;

function only(profile = canadian) {
  const [field] = plan(document, profile, [], { url: URL_US, postingDetails: { country: 'US' } }).fields;
  return field;
}

describe('export-control questions', () => {
  it('picks "None of the above" on a sanctions list that names none of your countries', () => {
    form(SANCTIONS);
    expect(only()).toMatchObject({
      fieldType: 'workAuth.usPerson',
      step: { kind: 'write', write: { kind: 'choose', labels: ['None of the above'] } },
    });
  });

  it('leaves a sanctions list to you when it names a country you are a citizen of or live in', () => {
    form(SANCTIONS);
    const russian = profileSchema.parse({
      ...canadian,
      address: { line1: '1 Example St', city: 'Moscow', country: 'RU' },
    });
    expect(only(russian)?.step).toMatchObject({ kind: 'skip', reason: 'notInProfile' });
  });

  it('leaves a list that excludes places ("a country other than Cuba") to you', () => {
    form(`
      <fieldset><legend>Export controls: which of the following applies to you?</legend>
        <label><input type="checkbox" name="t[]" value="1"> U.S. citizen</label>
        <label><input type="checkbox" name="t[]" value="2"> Individual granted citizenship in a country other than Cuba, Iran, North Korea, or Syria</label>
        <label><input type="checkbox" name="t[]" value="3"> None of these apply to me</label>
      </fieldset>`);
    expect(only()?.step).toMatchObject({ kind: 'skip', reason: 'notInProfile' });
  });

  it('picks "None" from the kinds of U.S. person when you are not one', () => {
    form(`
      <fieldset><legend>For export control purposes, are you a U.S. person?</legend>
        <label><input type="radio" name="p" value="1"> U.S. citizen or national</label>
        <label><input type="radio" name="p" value="2"> U.S. lawful permanent resident (green card holder)</label>
        <label><input type="radio" name="p" value="3"> Asylee or refugee in the U.S.</label>
        <label><input type="radio" name="p" value="4"> None of the above</label>
      </fieldset>`);
    expect(only()?.step).toMatchObject({
      kind: 'write',
      write: { kind: 'choose', labels: ['None of the above'] },
    });
  });

  it('still answers "Are you a U.S. person?" yes or no', () => {
    form(`
      <label for="u">Are you a U.S. person under export control regulations?</label>
      <select id="u" name="u"><option value="">Select...</option><option>Yes</option><option>No</option><option>Not applicable</option></select>`);
    expect(only()?.step).toMatchObject({ kind: 'write', write: { kind: 'select', labels: ['No'] } });
  });

  // Zoox (Lever): a text box, so "No option matches" made no sense either.
  it('fills "list your countries of citizenship" from the Profile, for review of the part it lacks', () => {
    form(`
      <label for="z">Export Control and Compliance: For the sole purpose of determining export licensing requirements, please list any countries of which you are a citizen or legal permanent resident, and when you obtained such status.</label>
      <input id="z" name="z" required>`);
    expect(only()).toMatchObject({
      fieldType: 'workAuth.citizenship',
      step: { kind: 'write', write: { kind: 'text', text: 'Canada' }, review: 'asksForMore' },
    });
  });

  it('fills a plain "countries of citizenship" box without review', () => {
    form(`<label for="c">What are your countries of citizenship?</label><input id="c" name="c">`);
    const step = only()?.step;
    expect(step).toMatchObject({ kind: 'write', write: { kind: 'text', text: 'Canada' } });
    expect(step).not.toHaveProperty('review');
  });

  it('a yes/no answer for a text box that asks for more says what the Profile lacks, not "no option"', () => {
    form(`<label for="e">Export controls: describe your U.S. person status.</label><input id="e" name="e">`);
    expect(only()?.step).toMatchObject({ kind: 'skip', reason: 'notInProfile' });
  });
});
