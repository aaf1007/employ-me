import { profileSchema, savedAnswerSchema, type SavedAnswer } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '../test-support/dom';
import { plan } from './index';

// Saved Answers kept from answers you gave on another company's form
// (design.md "Keeping answers you gave on the form", "Who fills what"): a
// later Fill uses one when the question matches word for word. Your Profile
// comes first, and answers it keeps per country or per company are never
// taken from a Saved Answer.

const URL_LEVER = new URL('https://jobs.lever.co/beta/0b2c9a3e-1111-4222-8333-444455556666/apply');

const profile = (screening: Record<string, unknown> = {}) =>
  profileSchema.parse({
    schemaVersion: 1,
    identity: { legalName: { first: 'Sam', last: 'Lee' } },
    contact: { email: 'sam.lee@example.com' },
    screening,
  });

let n = 0;
function saved(question: string, answer: string, fieldType = 'unknown'): SavedAnswer {
  n++;
  return savedAnswerSchema.parse({
    id: `s${n}`,
    question,
    answer,
    source: 'form',
    fieldType,
    createdAt: '2026-10-30T00:00:00Z',
    updatedAt: '2026-10-30T00:00:00Z',
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

function form(html: string): void {
  render(`<form id="application-form">${html}<button type="submit">Submit application</button></form>`);
}

const HOW_HEARD = `
  <label for="h">How did you hear about us?</label>
  <select id="h" name="h">
    <option value="">Select...</option>
    <option value="1">Company Website / Careers Page</option>
    <option value="2">LinkedIn Job Posting</option>
    <option value="3">Employee Referral</option>
    <option value="4">Other</option>
  </select>`;

function only(savedAnswers: readonly SavedAnswer[], who = profile()) {
  const [field] = plan(document, who, savedAnswers, { url: URL_LEVER }).fields;
  return field;
}

describe('a Saved Answer for a question the rules recognise', () => {
  it('fills it when your Profile has no answer, choosing the option by its text', () => {
    form(HOW_HEARD);
    // Kept from another company's form, whose option read just "LinkedIn".
    expect(only([saved('How did you hear about us?', 'LinkedIn', 'screening.howHeard')])).toMatchObject({
      fieldType: 'screening.howHeard',
      step: {
        kind: 'write',
        source: 'savedAnswer',
        write: { kind: 'select', labels: ['LinkedIn Job Posting'] },
      },
    });
  });

  it('leaves it to your Profile when the Profile has an answer', () => {
    form(HOW_HEARD);
    expect(
      only(
        [saved('How did you hear about us?', 'LinkedIn', 'screening.howHeard')],
        profile({ howHeard: 'Company website' }),
      ),
    ).toMatchObject({
      step: { kind: 'write', source: 'rules', write: { labels: ['Company Website / Careers Page'] } },
    });
  });

  it('only when the question matches word for word, ignoring case and punctuation', () => {
    form(HOW_HEARD);
    expect(only([saved('How did you first hear about this role?', 'LinkedIn')])).toMatchObject({
      step: { kind: 'skip', reason: 'notInProfile' },
    });
    expect(only([saved('HOW did you hear about us', 'LinkedIn')])).toMatchObject({
      step: { kind: 'write', source: 'savedAnswer' },
    });
  });

  it('never for an answer your Profile keeps per company or per country', () => {
    form(`
      <fieldset><legend>Have you ever worked for Beta before?</legend>
        <label><input type="radio" name="w" value="Yes"> Yes</label>
        <label><input type="radio" name="w" value="No"> No</label>
      </fieldset>
      <label for="s">What are your salary expectations?</label><input id="s" name="s">
      <fieldset><legend>Will you now or in the future require sponsorship?</legend>
        <label><input type="radio" name="v" value="Yes"> Yes</label>
        <label><input type="radio" name="v" value="No"> No</label>
      </fieldset>`);
    // Typed in by hand: a Saved Answer kept from a form can't hold these types at all.
    const manual = (question: string, answer: string) =>
      savedAnswerSchema.parse({
        id: question,
        question,
        answer,
        source: 'manual',
        createdAt: '2026-10-30T00:00:00Z',
        updatedAt: '2026-10-30T00:00:00Z',
      });
    const fields = plan(
      document,
      profile(),
      [
        manual('Have you ever worked for Beta before?', 'No'),
        manual('What are your salary expectations?', '120,000'),
        manual('Will you now or in the future require sponsorship?', 'No'),
      ],
      { url: URL_LEVER },
    ).fields;
    expect(fields.map((f) => f.fieldType)).toEqual([
      'screening.workedHereBefore',
      'pref.salary',
      'workAuth.sponsorship',
    ]);
    for (const field of fields) expect(field.step).not.toMatchObject({ source: 'savedAnswer' });
  });
});

describe('a Saved Answer for a question only you answer', () => {
  it('fills a choice question on another form whose options differ slightly', () => {
    form(`
      <fieldset><legend>Do you have any close relationships with current employees?</legend>
        <label><input type="radio" name="r" value="1"> Yes, I do</label>
        <label><input type="radio" name="r" value="2"> No, I do not</label>
      </fieldset>`);
    // Kept from a form whose options were just Yes and No.
    expect(only([saved('Do you have any close relationships with current employees?', 'No')])).toMatchObject({
      fieldType: 'unknown',
      step: { kind: 'write', source: 'savedAnswer', write: { kind: 'choose', labels: ['No, I do not'] } },
    });
  });

  it('fills a text question', () => {
    form(`<label for="t">Which time zone are you in?</label><input id="t" name="t">`);
    expect(only([saved('Which time zone are you in?', 'Eastern (UTC−5)')])).toMatchObject({
      step: { kind: 'write', source: 'savedAnswer', write: { kind: 'text', text: 'Eastern (UTC−5)' } },
    });
  });
});
