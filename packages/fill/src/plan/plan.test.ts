import { profileSchema } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { execute } from '../execute';
import { render } from '../test-support/dom';
import { plan } from './index';

// plan() and execute() on small forms. The recorded forms are covered by
// e2e/fill.spec.ts; these pin the rules design.md sets for every form.

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
  workAuthorization: {
    CA: { authorizedNow: true, sponsorship: 'no' },
    US: { authorizedNow: false, sponsorship: 'ask' },
  },
});

const URL_US = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

function form(html: string): void {
  render(`<form id="application-form">${html}<button type="submit">Submit application</button></form>`);
}

describe('plan', () => {
  it('gives every field exactly one step', () => {
    form(`
      <label for="n">Full name</label><input id="n" name="name">
      <label for="e">Email</label><input id="e" name="email">
      <label for="q">Why us?</label><textarea id="q" name="cards[x][field0]" required></textarea>
      <label for="u">Favourite colour</label><input id="u" name="cards[y][field0]">`);
    const planned = plan(document, profile, [], { url: URL_US });
    expect(planned.fields.map((f) => [f.field.fieldId, f.step.kind])).toEqual([
      ['n', 'write'],
      ['e', 'write'],
      ['q', 'awaitProvider'],
      ['u', 'awaitProvider'],
    ]);
    expect(planned.draftRequests.map((d) => d.fieldId)).toEqual(['q']);
    expect(planned.providerRequest?.fields.map((f) => f.fieldId)).toEqual(['u']);
  });

  it('never writes an Attestation, and never asks the Provider about one', () => {
    form(
      `<label><input type="checkbox" name="c"> I certify that the information above is true and complete.</label>`,
    );
    const planned = plan(document, profile, [], { url: URL_US });
    expect(planned.fields[0]).toMatchObject({
      fieldType: 'attestation.certify',
      step: { kind: 'skip', reason: 'attestation' },
    });
    expect(planned.providerRequest).toBeNull();
  });

  it('fills Self-ID from the Self-ID Answers, which default to decline', () => {
    document.title = 'Acme - Engineer';
    form(`
      <div class="posting-categories"><div class="location">New York, NY</div></div>
      <fieldset><legend>Gender</legend>
        <label><input type="radio" name="g" value="f"> Female</label>
        <label><input type="radio" name="g" value="m"> Male</label>
        <label><input type="radio" name="g" value="d"> Decline to self-identify</label>
      </fieldset>`);
    const planned = plan(document, profile, [], { url: URL_US });
    expect(planned.fields[0]).toMatchObject({
      fieldType: 'selfId.us.sex',
      step: {
        kind: 'write',
        source: 'selfId',
        write: { kind: 'choose', labels: ['Decline to self-identify'] },
      },
    });
  });

  it('sends Work Authorization to review when the country is unclear, with each country side by side', () => {
    form(`
      <div class="posting-categories"><div class="location">Toronto or New York</div></div>
      <label for="a">Are you authorized to work in the country where this job is based?</label>
      <select id="a" name="a"><option value="">Select...</option><option>Yes</option><option>No</option></select>`);
    const planned = plan(document, profile, [], { url: URL_US });
    expect(planned.country).toEqual({ kind: 'unclear', candidates: ['CA', 'US'] });
    expect(planned.fields[0]?.step).toEqual({
      kind: 'review',
      reason: 'countryUnclear',
      byCountry: [
        { country: 'CA', text: 'Yes' },
        { country: 'US', text: 'No' },
      ],
    });
  });

  // Live, 2026-10-28: Zoox (Lever) got "Sam" alone, Wave (Lever) got "No" typed as a referrer's name.
  it('a preferred name asked as first and last gets both, and a referrer’s name is never "No"', () => {
    form(`
      <label for="p">What is your preferred first name and last name? If your legal first and last name is your preferred name, you do not need to respond.</label>
      <textarea id="p" name="cards[a][field0]"></textarea>
      <label for="r">If you were referred by a Wave employee, please provide the name of the person who referred you here.</label>
      <input id="r" name="cards[a][field1]">
      <label for="w">Were you referred by a current employee?</label>
      <select id="w" name="w"><option value="">Select...</option><option>Yes</option><option>No</option></select>
      <label for="t">Have you been referred to us by someone that currently works at Acme? If so, who?</label>
      <input id="t" name="cards[a][field2]">`);
    const notReferred = { ...profile, screening: { ...profile.screening, referred: false } };
    const [preferred, referrer, referred, ifSoWho] = plan(document, notReferred, [], { url: URL_US }).fields;
    expect(preferred).toMatchObject({
      fieldType: 'name.preferred',
      step: { kind: 'write', write: { kind: 'text', text: 'Sam Lee' } },
    });
    expect(referrer?.step).toMatchObject({ kind: 'skip', reason: 'notInProfile' });
    expect(referred).toMatchObject({
      fieldType: 'screening.referred',
      step: { kind: 'write', write: { kind: 'select', labels: ['No'] } },
    });
    expect(ifSoWho?.step).toMatchObject({ kind: 'write', write: { kind: 'text', text: 'No' } });
  });

  // Live, 2026-10-28: Discord (Greenhouse) found no option for a city; Wave (Lever) asked the AI.
  it('"Are you located in <country>?" is answered yes or no from your address', () => {
    form(`
      <label for="us">Are you currently located in the US?</label>
      <select id="us" name="us"><option value="">Select...</option><option>Yes</option><option>No</option></select>
      <fieldset><legend>Are you located in Canada?</legend>
        <label><input type="radio" name="ca" value="Yes"> Yes</label>
        <label><input type="radio" name="ca" value="No"> No</label>
      </fieldset>`);
    const inToronto = {
      ...profile,
      address: { line1: '1 Example St', city: 'Toronto', region: 'ON', country: 'CA' },
    };
    const [us, ca] = plan(document, inToronto, [], { url: URL_US }).fields;
    expect(us).toMatchObject({
      fieldType: 'address.location',
      step: { kind: 'write', write: { kind: 'select', labels: ['No'] } },
    });
    expect(ca).toMatchObject({
      fieldType: 'address.location',
      step: { kind: 'write', write: { kind: 'choose', labels: ['Yes'] } },
    });
  });

  // Live, Cohere (Ashby, Toronto), 2026-10-28: a typo hid the question from the rules, the AI
  // matched it, and it went to review as if the Posting's country were unclear.
  it('a Work Authorization question the AI matched follows the Posting country too', () => {
    form(`
      <div class="posting-categories"><div class="location">Toronto, ON</div></div>
      <label for="s">Do you, now or in the future, require sponorship to work here?</label>
      <select id="s" name="s"><option value="">Select...</option><option>Yes</option><option>No</option></select>`);
    const planned = plan(document, profile, [], {
      url: URL_US,
      provider: {
        state: 'answered',
        mappings: [
          {
            fieldId: 's',
            match: { kind: 'fieldType', fieldType: 'workAuth.sponsorship', options: [] },
            confidence: 0.95,
          },
        ],
      },
    });
    expect(planned.country).toEqual({ kind: 'known', country: 'CA' });
    expect(planned.fields[0]).toMatchObject({
      fieldType: 'workAuth.sponsorship',
      step: { kind: 'write', source: 'provider', write: { kind: 'select', labels: ['No'] } },
    });
  });

  // design.md "Drafts": required free-text questions are drafted during the Fill. Live, Ramp (Ashby),
  // 2026-10-28: questions only the AI recognised as free text ended as "Couldn't fill", with no Draft button.
  it('a required question the AI says needs a Draft is drafted in the next round', () => {
    form(`
      <label for="q">Do you have proficiency in JavaScript and React? Please describe. *</label>
      <input id="q" name="q" required>`);
    const answered = (feedback: { draftsReady?: string[]; draftsFailed?: string[] } = {}) =>
      plan(document, profile, [], {
        url: URL_US,
        provider: {
          state: 'answered',
          mappings: [{ fieldId: 'q', match: { kind: 'needsDraft' }, confidence: 0.9 }],
          ...feedback,
        },
      });
    const next = answered();
    expect(next.fields[0]).toMatchObject({
      fieldType: 'freeText.question',
      step: { kind: 'awaitProvider', need: 'draft' },
    });
    expect(next.draftRequests.map((d) => d.fieldId)).toEqual(['q']);
    expect(answered({ draftsReady: ['q'] }).fields[0]?.step).toMatchObject({ kind: 'review' });
    // A Draft the Provider couldn't write stops the wait: the field says so, with the fix.
    // Live, Ramp (Ashby), 2026-10-28: it said "The AI is unavailable", though the AI had just mapped the form.
    expect(answered({ draftsFailed: ['q'] }).fields[0]?.step).toMatchObject({
      kind: 'skip',
      reason: 'draftFailed',
    });
  });

  // Live, 2026-10-28: Wave (Lever) asked for "a number" and 1Password (Ashby) for each end of a range
  // "with no commas"; both got "150,000 - 175,000 CAD per year".
  it('a salary box gets the part and the format it asks for', () => {
    form(`
      <div class="posting-categories"><div class="location">Toronto, ON</div></div>
      <label for="n">What is your desired salary? (Please write down a number)</label><textarea id="n" name="n"></textarea>
      <label for="b">What is the beginning of your desired annual base salary range? (please format with no commas, i.e. $50000, £50000)</label><input id="b" name="b">
      <label for="e">What is the end of your desired annual base salary range? (please format with no commas, i.e. $70000, £70000)</label><input id="e" name="e">
      <label for="w">What are your salary expectations?</label><input id="w" name="w">`);
    const withSalary = profileSchema.parse({
      ...profile,
      preferences: {
        ...profile.preferences,
        salary: { CA: { currency: 'CAD', min: 150000, max: 175000, period: 'year' } },
      },
    });
    const texts = plan(document, withSalary, [], { url: URL_US }).fields.map((f) =>
      f.step.kind === 'write' && f.step.write.kind === 'text' ? f.step.write.text : f.step.kind,
    );
    expect(texts).toEqual(['150000', '150000', '175000', '150,000 - 175,000 CAD per year']);
  });

  // Live, Notion (Ashby), 2026-10-28: the AI matched it, and "offices" (plural) found no answer.
  it('"work from our offices … days a week" is a yes for someone open to hybrid', () => {
    form(`
      <fieldset><legend>We work from our offices on Mondays, Tuesdays, and Thursdays. Can you work from our offices three days a week?</legend>
        <label><input type="radio" name="o" value="Yes"> Yes</label>
        <label><input type="radio" name="o" value="No"> No</label>
      </fieldset>`);
    const hybrid = profileSchema.parse({
      ...profile,
      preferences: { ...profile.preferences, workModels: ['hybrid', 'remote'] },
    });
    expect(plan(document, hybrid, [], { url: URL_US }).fields[0]).toMatchObject({
      fieldType: 'pref.workModel',
      step: { kind: 'write', write: { kind: 'choose', labels: ['Yes'] } },
    });
  });

  it('when the whole Provider is unavailable, a failed Draft shows the helper’s own fix', () => {
    form(`<label for="q">Why Acme?</label><textarea id="q" name="q" required></textarea>`);
    const step = plan(document, profile, [], {
      url: URL_US,
      provider: {
        state: 'unavailable',
        unavailableFix: 'Your usage limit resets at 5pm.',
        draftsFailed: ['q'],
      },
    }).fields[0]?.step;
    expect(step).toEqual({
      kind: 'skip',
      reason: 'providerUnavailable',
      fix: 'Your usage limit resets at 5pm.',
    });
  });

  it('"Ask me each time" sponsorship goes to review', () => {
    form(`
      <label for="s">Will you now or in the future require sponsorship to work in the United States?</label>
      <select id="s" name="s"><option value="">Select...</option><option>Yes</option><option>No</option></select>`);
    expect(plan(document, profile, [], { url: URL_US }).fields[0]?.step).toEqual({
      kind: 'review',
      reason: 'askEachTime',
    });
  });

  // Live, 2026-10-28: a company the Profile doesn't list said "You asked to answer this one each time."
  it('"worked here before" for a company the Profile doesn’t list says so, and how to add it', () => {
    form(`
      <fieldset><legend>Have you previously worked for Acme?</legend>
        <label><input type="radio" name="w" value="Yes"> Yes</label>
        <label><input type="radio" name="w" value="No"> No</label>
      </fieldset>`);
    const step = plan(document, profile, [], { url: URL_US }).fields[0]?.step;
    expect(step).toMatchObject({ kind: 'skip', reason: 'notInProfile' });
    expect(step).toHaveProperty('fix', expect.stringMatching(/worked at acme before.*Screening answers/));
    const known = profileSchema.parse({ ...profile, screening: { workedHereBefore: { acme: false } } });
    expect(plan(document, known, [], { url: URL_US }).fields[0]?.step).toMatchObject({
      kind: 'write',
      write: { kind: 'choose', labels: ['No'] },
    });
  });

  it('a low-confidence Provider mapping is a suggestion for review, never a write', () => {
    form(`<label for="u">Contact address for recruiters</label><input id="u" name="u">`);
    const mapping = (confidence: number) =>
      plan(document, profile, [], {
        url: URL_US,
        provider: {
          state: 'answered',
          mappings: [
            {
              fieldId: 'u',
              match: { kind: 'fieldType', fieldType: 'contact.email', options: [] },
              confidence,
            },
          ],
        },
      }).fields[0]?.step;
    expect(mapping(0.95)).toMatchObject({ kind: 'write', review: 'providerMatched', source: 'provider' });
    expect(mapping(0.4)).toEqual({
      kind: 'review',
      reason: 'providerMatched',
      suggestion: 'sam.lee@example.com',
    });
  });

  // design.md "Sensitive questions": Attestations and never-stored fields
  // never fill. An AI mapping can't change that. (A Self-ID question the AI
  // recognises fills from your Self-ID Answers: self-id-mapping.test.ts.)
  it.each(['attestation.consent', 'never.dateOfBirth'] as const)(
    'never writes a field the AI maps to %s, however sure it is: it goes to review',
    async (fieldType) => {
      form(`
        <label for="u">Which of these describes you?</label>
        <select id="u" name="u">
          <option value="">Select...</option><option>Asian</option><option>White</option>
          <option>Yes</option><option>I don't wish to answer</option>
        </select>`);
      const planned = plan(document, profile, [], {
        url: URL_US,
        provider: {
          state: 'answered',
          mappings: [
            {
              fieldId: 'u',
              match: {
                kind: 'fieldType',
                fieldType,
                options: [{ option: "I don't wish to answer", value: 'decline' }],
              },
              confidence: 1,
            },
          ],
        },
      });
      expect(planned.fields[0]).toMatchObject({
        fieldType,
        step: { kind: 'review', reason: 'providerMatched' },
      });
      expect(planned.fields[0]?.step).not.toHaveProperty('suggestion');
      const report = await execute(planned);
      expect(report.outcomes).toEqual([
        { kind: 'needsReview', fieldId: 'u', fieldType, reason: 'providerMatched' },
      ]);
      expect(document.querySelector<HTMLSelectElement>('#u')?.value).toBe('');
    },
  );

  it('marks fields the AI needed as unavailable, with the helper’s fix, when it is', () => {
    form(`<label for="u">Favourite colour</label><input id="u" name="u">`);
    const planned = plan(document, profile, [], {
      url: URL_US,
      provider: { state: 'unavailable', unavailableFix: 'Run setup.' },
    });
    expect(planned.fields[0]?.step).toEqual({
      kind: 'skip',
      reason: 'providerUnavailable',
      fix: 'Run setup.',
    });
  });
});

describe('execute', () => {
  it('writes, reads back, and never presses Submit', async () => {
    form(`
      <label for="n">Full name</label><input id="n" name="name">
      <label><input type="checkbox" name="c"> I agree to the terms and conditions</label>`);
    let submitted = 0;
    document.addEventListener('submit', () => (submitted += 1), true);
    const report = await execute(
      plan(document, profile, [], { url: URL_US, provider: { state: 'unavailable' } }),
    );
    expect(report.outcomes).toHaveLength(2);
    expect(report.outcomes[0]).toEqual({
      kind: 'filled',
      fieldId: 'n',
      fieldType: 'name.full',
      source: 'rules',
    });
    expect(report.outcomes[1]).toMatchObject({
      kind: 'couldNotFill',
      fieldId: 'c',
      fieldType: 'attestation.other',
      reason: 'attestation',
    });
    expect(document.querySelector<HTMLInputElement>('#n')?.value).toBe('Sam Lee');
    expect(document.querySelector<HTMLInputElement>('input[name="c"]')?.checked).toBe(false);
    expect(submitted).toBe(0);
  });

  it('reports a value the page threw away as "didn’t stick", never as filled', async () => {
    form(`<label for="n">Full name</label><input id="n" name="name">`);
    const input = document.querySelector('#n');
    // A controlled input that snaps back to empty, as some frameworks do.
    input?.addEventListener('input', () =>
      setTimeout(() => {
        input.setAttribute('value', '');
      }, 0),
    );
    input?.addEventListener('change', () =>
      setTimeout(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '');
      }, 0),
    );
    const report = await execute(
      plan(document, profile, [], { url: URL_US, provider: { state: 'unavailable' } }),
    );
    expect(report.outcomes[0]).toMatchObject({ kind: 'couldNotFill', reason: 'valueDidNotStick' });
  });
});
