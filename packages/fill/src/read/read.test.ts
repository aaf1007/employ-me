import { profileSchema } from '@employ-me/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { execute } from '../execute';
import { clearOutcomes, showOutcomes } from '../outline';
import { plan } from '../plan';
import { render } from '../test-support/dom';
import { submittedAnswers } from './index';

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
});
const URL_US = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('submittedAnswers', () => {
  it('keeps what the form shows, Self-ID included, and never a date of birth, signature or file', () => {
    render(`<form id="application-form">
      <label for="n">Full name</label><input id="n" name="name" value="Sam Lee">
      <label for="d">Date of birth</label><input id="d" name="dob" value="2000-01-01">
      <label for="s">Signature</label><input id="s" name="signature" value="Sam Lee">
      <label for="r">Resume</label><input id="r" name="resume" type="file">
      <fieldset><legend>Gender</legend>
        <label><input type="radio" name="g" value="f"> Female</label>
        <label><input type="radio" name="g" value="d" checked> Decline to self-identify</label>
      </fieldset>
      <label><input type="checkbox" name="c"> I certify that the information above is true.</label>
      <label for="e">Email</label><input id="e" name="email">
    </form>`);
    const answers = submittedAnswers(plan(document, profile, [], { url: URL_US }).fields);
    expect(answers.map((a) => [a.fieldType, a.value])).toEqual([
      ['name.full', 'Sam Lee'],
      ['selfId.other', 'Decline to self-identify'],
      ['attestation.certify', false],
    ]);
  });
});

describe('outlines', () => {
  it('outlines each field in its group’s colour and puts the page’s own style back', async () => {
    render(`<form id="application-form">
      <label for="n">Full name</label><input id="n" name="name" style="outline: 1px dotted blue">
      <label for="x">Favourite colour</label><input id="x" name="x">
    </form>`);
    const report = await execute(
      plan(document, profile, [], { url: URL_US, provider: { state: 'unavailable' } }),
    );
    showOutcomes(report);
    const name = document.querySelector<HTMLElement>('#n');
    const other = document.querySelector<HTMLElement>('#x');
    expect(name?.style.getPropertyValue('outline')).toMatch(/2px solid/);
    expect(other?.style.getPropertyValue('outline')).toMatch(/2px solid/);
    expect(name?.style.getPropertyValue('outline')).not.toBe(other?.style.getPropertyValue('outline'));

    clearOutcomes();
    expect(name?.getAttribute('style')).toBe('outline: 1px dotted blue;');
    expect(other?.getAttribute('style')).toBe('');
  });
});
