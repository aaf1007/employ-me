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

  it('"Ask me each time" sponsorship goes to review', () => {
    form(`
      <label for="s">Will you now or in the future require sponsorship to work in the United States?</label>
      <select id="s" name="s"><option value="">Select...</option><option>Yes</option><option>No</option></select>`);
    expect(plan(document, profile, [], { url: URL_US }).fields[0]?.step).toEqual({
      kind: 'review',
      reason: 'askEachTime',
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

  // design.md "Sensitive questions": Self-ID fills only from your Self-ID
  // Answers, on questions the rules recognise; Attestations and never-stored
  // fields never fill. An AI mapping can't change that.
  it.each(['selfId.us.race', 'selfId.other', 'attestation.consent', 'never.dateOfBirth'] as const)(
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
