import { profileSchema, type CountryCode, type FieldType } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { execute } from '../execute';
import { render } from '../test-support/dom';
import { plan } from './index';

// design.md "Sensitive questions": when the rules don't recognise a Self-ID
// question, the AI may say which one it is, and what each option means, from
// its wording and options alone. The answer still comes from the Self-ID
// Answers, and the field always goes to Needs your review.

const URL_US = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
  selfId: { US: { race: 'twoOrMoreRaces' }, CA: { visibleMinority: 'yes' } },
});
const declines = profileSchema.parse({ schemaVersion: 1 });

// Option words the vocab patterns don't know: only the AI's option map finds them.
const HERITAGE = `
  <label for="u">Which of these best describes your heritage?</label>
  <select id="u" name="u">
    <option value="">Select...</option><option>East or South Asian</option><option>European</option>
    <option>Mixed heritage</option><option>Skip this question</option>
  </select>`;
const OPTION_MAP = [
  { option: 'East or South Asian', value: 'asian' },
  { option: 'European', value: 'white' },
  { option: 'Mixed heritage', value: 'twoOrMoreRaces' },
  { option: 'Skip this question', value: 'decline' },
];

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

function form(html: string): void {
  render(`<form id="application-form">${html}<button type="submit">Submit application</button></form>`);
}

function planWith(
  fieldType: FieldType,
  confidence: number,
  { country = 'US', who = profile }: { country?: CountryCode; who?: typeof profile } = {},
) {
  return plan(document, who, [], {
    url: URL_US,
    postingDetails: { country },
    provider: {
      state: 'answered',
      mappings: [{ fieldId: 'u', match: { kind: 'fieldType', fieldType, options: OPTION_MAP }, confidence }],
    },
  });
}

const selected = () => document.querySelector<HTMLSelectElement>('#u')?.selectedOptions[0]?.text ?? '';

describe('a Self-ID question only the AI recognises', () => {
  it('is filled with your Self-ID Answer, through the AI’s option map, and goes to review', async () => {
    form(HERITAGE);
    const planned = planWith('selfId.us.race', 0.95);
    expect(planned.fields[0]).toMatchObject({
      fieldType: 'selfId.us.race',
      step: { kind: 'write', source: 'selfId', review: 'providerMatched' },
    });
    const report = await execute(planned);
    expect(report.outcomes).toEqual([
      { kind: 'needsReview', fieldId: 'u', fieldType: 'selfId.us.race', reason: 'providerMatched' },
    ]);
    expect(selected()).toBe('Mixed heritage');
  });

  it('declines when you set no Self-ID Answer', async () => {
    form(HERITAGE);
    await execute(planWith('selfId.us.race', 0.95, { who: declines }));
    expect(selected()).toBe('Skip this question');
  });

  it('declines a Self-ID question you keep no answer for (selfId.other)', async () => {
    form(HERITAGE);
    const report = await execute(planWith('selfId.other', 0.95));
    expect(report.outcomes[0]).toMatchObject({ kind: 'needsReview', reason: 'providerMatched' });
    expect(selected()).toBe('Skip this question');
  });

  it('falls back to the vocab’s own wording when the AI mapped no option to your answer', async () => {
    form(`
      <label for="u">Which of these best describes your heritage?</label>
      <select id="u" name="u">
        <option value="">Select...</option><option>Two or more races</option><option>Skip this question</option>
      </select>`);
    await execute(planWith('selfId.us.race', 0.95));
    expect(selected()).toBe('Two or more races');
  });

  it('a weak match goes to review with nothing written or suggested', async () => {
    form(HERITAGE);
    const planned = planWith('selfId.us.race', 0.5);
    expect(planned.fields[0]?.step).toEqual({ kind: 'review', reason: 'providerMatched' });
    await execute(planned);
    expect(document.querySelector<HTMLSelectElement>('#u')?.value).toBe('');
  });

  it.each([
    ['selfId.ca.visibleMinority', 'US'],
    ['selfId.us.race', 'CA'],
  ] as const)(
    'a %s question on a %s Posting goes to review with nothing written',
    async (fieldType, country) => {
      form(HERITAGE);
      const planned = planWith(fieldType, 0.95, { country });
      expect(planned.fields[0]).toMatchObject({
        fieldType,
        step: { kind: 'review', reason: 'providerMatched' },
      });
      await execute(planned);
      expect(document.querySelector<HTMLSelectElement>('#u')?.value).toBe('');
    },
  );

  // CodeRabbit on #4: the question's own words name a country, which the
  // field's country choice prefers. The Posting's country still has to agree.
  it('a question naming another country than the Posting’s goes to review with nothing written', async () => {
    form(`
      <label for="u">Is your heritage one the Canadian census counts apart?</label>
      <select id="u" name="u">
        <option value="">Select...</option><option>Yes</option><option>No</option>
        <option>Skip this question</option>
      </select>`);
    const planned = planWith('selfId.ca.visibleMinority', 0.95, { country: 'US' });
    expect(planned.fields[0]?.step).toEqual({ kind: 'review', reason: 'providerMatched' });
    await execute(planned);
    expect(document.querySelector<HTMLSelectElement>('#u')?.value).toBe('');
  });

  // CodeRabbit on #4: an unclear country goes to review (design.md "Country-specific
  // answers"), and a written answer is one the site can read before you review it.
  it.each([
    ['names none', undefined],
    ['names the US and Canada', 'New York, NY; Toronto, ON'],
  ] as const)('writes nothing when the Posting %s', async (_what, location) => {
    form(HERITAGE);
    const planned = plan(document, profile, [], {
      url: URL_US,
      postingDetails: location === undefined ? {} : { location },
      provider: {
        state: 'answered',
        mappings: [
          {
            fieldId: 'u',
            match: { kind: 'fieldType', fieldType: 'selfId.us.race', options: OPTION_MAP },
            confidence: 0.95,
          },
        ],
      },
    });
    expect(planned.fields[0]?.step).toEqual({ kind: 'review', reason: 'providerMatched' });
    await execute(planned);
    expect(document.querySelector<HTMLSelectElement>('#u')?.value).toBe('');
  });

  it('a text box is left for you: Self-ID fills only choices', () => {
    form(`<label for="u">Tell us about your heritage</label><input id="u" name="u">`);
    expect(planWith('selfId.us.race', 0.95).fields[0]?.step).toMatchObject({
      kind: 'skip',
      reason: 'notInProfile',
    });
  });

  it('sends the AI labels and options only: no Profile or Self-ID values, and no question the rules see as Self-ID', () => {
    form(`
      ${HERITAGE}
      <fieldset><legend>Race</legend>
        <label><input type="radio" name="r" value="1"> Asian</label>
        <label><input type="radio" name="r" value="2"> Two or More Races</label>
      </fieldset>`);
    const request = plan(document, profile, [], {
      url: URL_US,
      postingDetails: { country: 'US' },
    }).providerRequest;
    expect(request?.fields.map((f) => f.fieldId)).toEqual(['u']);
    const sent = JSON.stringify(request);
    for (const value of ['twoOrMoreRaces', 'decline', 'Sam', 'sam.lee@example.com', 'Two or More Races']) {
      expect(sent).not.toContain(value);
    }
  });
});
