import { profileSchema } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '../test-support/dom';
import { draftRequestFor, plan, type PlanOptions } from './index';

// Free-text questions neither the rules nor the AI recognised (live,
// Palantir and Ramp, 2026-10-28: "years of experience with X", "security
// clearance"). design.md "Drafts": required ones are drafted during the
// Fill, optional ones get a Draft button. They used to end as a bare
// "Couldn't fill: not recognised".

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
});

const URL_US = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');

beforeEach(() => {
  document.body.innerHTML = '';
});

function form(html: string): void {
  render(`<form id="application-form">${html}<button type="submit">Submit application</button></form>`);
}

const FORM = `
  <label for="y">How many years of experience do you have with Kubernetes?</label><input id="y" name="y" required>
  <label for="c">Do you hold an active security clearance? If so, which one?</label><input id="c" name="c">
  <label for="l">Tell us about a project you led.</label><textarea id="l" name="l"></textarea>
  <fieldset><legend>Do you have a clearance?</legend>
    <label><input type="radio" name="r" value="Yes"> Yes</label>
    <label><input type="radio" name="r" value="No"> No</label>
  </fieldset>`;

const ids = ['y', 'c', 'l', 'r'];

function answered(match: 'unknown' | 'none', feedback: Partial<NonNullable<PlanOptions['provider']>> = {}) {
  return plan(document, profile, [], {
    url: URL_US,
    provider: {
      state: 'answered',
      mappings:
        match === 'none'
          ? []
          : ids.map((fieldId) => ({ fieldId, match: { kind: 'unknown' }, confidence: 0 })),
      ...feedback,
    },
  });
}

describe('free-text questions nobody recognised', () => {
  it.each(['unknown', 'none'] as const)(
    'get a Draft when required and a Draft button when optional (AI said: %s)',
    (match) => {
      form(FORM);
      const planned = answered(match);
      const [years, clearance, project, radio] = planned.fields;
      expect(years).toMatchObject({
        fieldType: 'freeText.question',
        step: { kind: 'awaitProvider', need: 'draft' },
      });
      expect(planned.draftRequests.map((d) => d.fieldId)).toEqual(['y']);
      for (const optional of [clearance, project]) {
        expect(optional).toMatchObject({
          fieldType: 'freeText.question',
          step: { kind: 'skip', reason: 'notInProfile' },
        });
        expect(draftRequestFor(planned, optional?.field.fieldId ?? '')).not.toBeNull();
      }
      // A choice has no Draft: it stays yours to answer.
      expect(radio).toMatchObject({
        fieldType: 'unknown',
        step: { kind: 'skip', reason: 'unrecognizedField' },
      });
      expect(draftRequestFor(planned, 'r')).toBeNull();
    },
  );

  it('shows the Draft once it is ready, and the Draft failure when it isn’t', () => {
    form(FORM);
    expect(answered('unknown', { draftsReady: ['y'] }).fields[0]?.step).toEqual({
      kind: 'review',
      reason: 'draftReady',
    });
    expect(answered('unknown', { draftsFailed: ['y'] }).fields[0]?.step).toMatchObject({
      kind: 'skip',
      reason: 'draftFailed',
    });
  });

  it('with the AI unavailable, says so with the helper’s fix', () => {
    form(FORM);
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
