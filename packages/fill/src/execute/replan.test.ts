import { profileSchema } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { plan, type ProviderFeedback } from '../plan';
import { render } from '../test-support/dom';
import { execute } from './index';

// Re-planning (design.md "Starting a Fill": one Fill carries on): a re-plan
// writes only what it newly resolved, and never what the user changed.

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
});
const URL_LEVER = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');

beforeEach(() => {
  document.body.innerHTML = '';
});

function form(html: string): void {
  render(`<form id="application-form">${html}<button type="submit">Submit application</button></form>`);
}

const planWith = (provider: ProviderFeedback = {}) =>
  plan(document, profile, [], { url: URL_LEVER, provider });

const emailMapping: ProviderFeedback = {
  state: 'answered',
  mappings: [
    { fieldId: 'u', match: { kind: 'fieldType', fieldType: 'contact.email', options: [] }, confidence: 0.95 },
  ],
};

/** The user types into a field, as a person would. */
function userTypes(selector: string, text: string): void {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (el === null) throw new Error(`no ${selector}`);
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const value = (selector: string) =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value;

describe('execute(plan, previous)', () => {
  it('writes only the fields the re-plan newly resolved, and leaves the user’s edits alone', async () => {
    form(`
      <label for="n">Full name</label><input id="n" name="name">
      <label for="u">Contact address for recruiters</label><input id="u" name="u">`);
    const first = await execute(planWith());
    expect(value('#n')).toBe('Sam Lee');
    expect(first.awaitingProvider.map((a) => a.fieldId)).toEqual(['u']);

    userTypes('#n', 'Samuel Lee');
    const second = await execute(planWith(emailMapping), first);

    expect(value('#n')).toBe('Samuel Lee');
    expect(value('#u')).toBe('sam.lee@example.com');
    expect(second.userEdited).toEqual(new Set(['n']));
    expect(second.outcomes).toEqual([
      { kind: 'filled', fieldId: 'n', fieldType: 'name.full', source: 'rules' },
      { kind: 'needsReview', fieldId: 'u', fieldType: 'contact.email', reason: 'providerMatched' },
    ]);
    expect(second.awaitingProvider).toEqual([]);

    // And again, with nothing new: nothing is written, the edit still stands.
    const third = await execute(planWith(emailMapping), second);
    expect(value('#n')).toBe('Samuel Lee');
    expect(third.outcomes).toEqual(second.outcomes);
  });

  // e2e side-panel "one Fill carries on" (flaky): you changed a field during a re-plan's settle wait,
  // and the report took your text as the Fill's own, so "Changed by you" never showed.
  it('still sees an edit you made while a re-plan was running', async () => {
    form(`
      <label for="n">Full name</label><input id="n" name="name">
      <label for="u">Contact address for recruiters</label><input id="u" name="u">`);
    const first = await execute(planWith());
    const running = execute(planWith(emailMapping), first);
    userTypes('#n', 'Samuel Lee');
    const second = await running;
    expect(second.userEdited).toEqual(new Set(['n']));
    // So the next re-plan leaves it alone too.
    const third = await execute(planWith(emailMapping), second);
    expect(value('#n')).toBe('Samuel Lee');
    expect(third.userEdited).toEqual(new Set(['n']));
  });

  it('keeps an answer the user wrote while the Provider was still thinking', async () => {
    form(`<label for="u">Contact address for recruiters</label><input id="u" name="u">`);
    const first = await execute(planWith());
    userTypes('#u', 'me@example.org');
    const second = await execute(planWith(emailMapping), first);
    expect(value('#u')).toBe('me@example.org');
    expect(second.outcomes).toEqual([
      { kind: 'needsReview', fieldId: 'u', fieldType: 'contact.email', reason: 'keptYourEdit' },
    ]);
  });

  it('writes an accepted Draft, and a re-accepted edit of it, but not over the user’s own text', async () => {
    form(`<label for="q">Why us?</label><textarea id="q" name="q" required></textarea>`);
    const first = await execute(planWith({ state: 'answered', draftsReady: ['q'] }));
    expect(first.outcomes[0]).toMatchObject({ kind: 'needsReview', reason: 'draftReady' });
    expect(value('#q')).toBe('');

    const accepted = (text: string): ProviderFeedback => ({
      state: 'answered',
      accepted: [{ fieldId: 'q', text }],
    });
    const second = await execute(planWith(accepted('Because of the mission.')), first);
    expect(value('#q')).toBe('Because of the mission.');
    expect(second.outcomes[0]).toMatchObject({ kind: 'filled', source: 'savedAnswer' });

    const third = await execute(planWith(accepted('Because of the people.')), second);
    expect(value('#q')).toBe('Because of the people.');

    userTypes('#q', 'My own words.');
    const fourth = await execute(planWith(accepted('Because of the product.')), third);
    expect(value('#q')).toBe('My own words.');
    expect(fourth.outcomes[0]).toMatchObject({ kind: 'needsReview', reason: 'keptYourEdit' });
  });

  it('carries on into the form’s next step, keeping the earlier step’s outcomes', async () => {
    form(`<div id="step"><label for="n">Full name</label><input id="n" name="name"></div>`);
    const first = await execute(planWith({ state: 'unavailable' }));

    // The user clicks Next: the page swaps step 1 for step 2.
    const step = document.querySelector('#step');
    if (step === null) throw new Error('no step');
    step.innerHTML = '<label for="e">Email</label><input id="e" name="email">';
    const second = await execute(planWith({ state: 'unavailable' }), first);

    expect(value('#e')).toBe('sam.lee@example.com');
    expect(second.outcomes.map((o) => [o.fieldId, o.kind])).toEqual([
      ['n', 'filled'],
      ['e', 'filled'],
    ]);
    expect(second.fields.map((f) => f.fieldId)).toEqual(['n', 'e']);
  });

  it('without a previous report, fills as before (the first Fill)', async () => {
    form(`<label for="n">Full name</label><input id="n" name="name" value="Parsed Person">`);
    await execute(planWith({ state: 'unavailable' }));
    expect(value('#n')).toBe('Sam Lee');
  });
});
