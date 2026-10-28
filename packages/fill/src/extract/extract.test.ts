import { beforeEach, describe, expect, it } from 'vitest';
import onePassword from '../../../../fixtures/ashby/1password-2026-10-28.html?raw';
import ashby from '../../../../fixtures/ashby/openai-2026-10-28.html?raw';
import ramp from '../../../../fixtures/ashby/ramp-2026-10-28.html?raw';
import helsing from '../../../../fixtures/generic/helsing-2026-10-28.html?raw';
import greenhouse from '../../../../fixtures/greenhouse/anthropic-2026-10-28.html?raw';
import lever from '../../../../fixtures/lever/eqbank-2026-10-28.html?raw';
import { adapterFor } from '../adapters';
import { loadPage, render } from '../test-support/dom';
import { extractFields } from './index';

function fieldsOf(url: string) {
  const adapter = adapterFor(new URL(url));
  const form = adapter.findForm(document);
  if (form === null) throw new Error('no form');
  return adapter.extract(form);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extract on recorded forms', () => {
  it('Greenhouse: labels, react-select comboboxes, file groups, the EEO section', () => {
    loadPage(greenhouse);
    const fields = fieldsOf('https://job-boards.greenhouse.io/anthropic/jobs/5456619008');
    const byId = new Map(fields.map((f) => [f.fieldId, f]));
    expect(byId.get('first_name')).toMatchObject({
      label: 'First Name',
      widget: 'text',
      required: true,
      maxLength: 255,
    });
    expect(byId.get('country')).toMatchObject({ label: 'Country', widget: 'combobox', control: 'combobox' });
    // The file input's own label is "Attach"; the field's is its group's.
    expect(byId.get('resume')).toMatchObject({ label: 'Resume/CV', widget: 'file', required: true });
    expect(byId.get('question_19018737008')).toMatchObject({
      label: 'Personal Preferences',
      required: false,
    });
    expect(byId.get('gender')).toMatchObject({ section: 'Voluntary Self-Identification' });
    // react-select's hidden "required" mirrors and reCAPTCHA's textarea are not fields.
    expect(fields.some((f) => f.fieldId.includes('recaptcha'))).toBe(false);
    expect(fields).toHaveLength(25);
  });

  it("Lever: questions and options from the cards' baseTemplate JSON", () => {
    loadPage(lever);
    const fields = fieldsOf('https://jobs.lever.co/eqbank/a20b80c5-53c4-4c34-b8de-c6d9208994a6/apply');
    const auth = fields.find((f) => f.fieldId.startsWith('cards[b9fc5bb5'));
    expect(auth).toMatchObject({
      label: 'Are you legally entitled to work in Canada?',
      widget: 'select',
      options: ['Yes', 'No'],
      required: true,
      section: 'Work Authorization',
    });
    const disability = fields.find((f) => f.fieldId.endsWith('[responses][field2]'));
    expect(disability).toMatchObject({
      label: 'Do you self-identify as a person with a disability?',
      widget: 'radios',
      options: ['Yes', 'No', 'Prefer not to say'],
    });
    // Lever's location box searches as you type; LinkedIn's widget is left out.
    expect(fields.find((f) => f.fieldId === 'location-input')?.widget).toBe('typeahead');
    expect(fields.some((f) => f.label.includes('LinkedIn profile'))).toBe(false);
  });

  it('Ashby: Yes/No buttons, radio groups in fieldsets, and no autofill box', () => {
    loadPage(ashby);
    const fields = fieldsOf(
      'https://jobs.ashbyhq.com/openai/3c67f712-697d-48d8-b05c-01be896e61da/application',
    );
    expect(fields.find((f) => f.fieldId === 'fa073c03-b0bc-47ce-925f-2f19ddc5c842')).toMatchObject({
      label: 'Are you authorized to work in the country where the job is located?',
      widget: 'buttons',
      options: ['Yes', 'No'],
      required: true,
    });
    expect(fields.find((f) => f.fieldId.endsWith('_systemfield_eeoc_gender'))).toMatchObject({
      label: 'Gender',
      widget: 'radios',
      options: ['Male', 'Female', 'Decline to self-identify'],
    });
    expect(fields.filter((f) => f.widget === 'file').map((f) => f.fieldId)).toEqual(['_systemfield_resume']);
  });

  // Live, 1Password, 2026-10-28: each checkbox was its own field, named after its option.
  it('Ashby: a select-all-that-apply question is one field, keyed by its question', () => {
    loadPage(onePassword);
    const fields = fieldsOf(
      'https://jobs.ashbyhq.com/1password/6f78b170-9600-4b2d-9682-feead160100d/application',
    );
    const race = fields.filter((f) => f.label === 'How do you identify your racial or ethnic background?');
    expect(race).toHaveLength(1);
    expect(race[0]).toMatchObject({
      fieldId: 'aabdaff4-8bad-45e1-8121-b589277688c7',
      widget: 'checkboxes',
      control: 'checkboxGroup',
    });
    expect(race[0]?.options).toContain('Prefer not to say');
    expect(fields.some((f) => f.fieldId === 'Black' || f.fieldId === 'Prefer not to say')).toBe(false);
  });

  // Live, Ramp, 2026-10-28: both consent radios were listed as "Phone".
  it('Ashby: the SMS and WhatsApp consent radios are named for what they ask', () => {
    loadPage(ramp);
    const fields = fieldsOf('https://jobs.ashbyhq.com/ramp/4e64ab86-4e30-403b-b1b9-41dc052570ce/application');
    expect(fields.find((f) => f.fieldId === 'smsConsent')?.label).toBe(
      'SMS messages about your application: do you consent?',
    );
    expect(fields.find((f) => f.fieldId === 'whatsAppConsent')?.label).toBe(
      'WhatsApp messages about your application: do you consent?',
    );
  });

  it('generic: labels from nearby text when the markup has none', () => {
    loadPage(helsing);
    const fields = fieldsOf('https://helsing.ai/jobs/4927641101?gh_jid=4927641101');
    expect(fields.find((f) => f.fieldId === 'question_9310683101')).toMatchObject({
      label: 'Are you open to relocation?',
      widget: 'radios',
      options: ['No', 'Yes'],
    });
    expect(fields.find((f) => f.fieldId === 'file')).toMatchObject({ label: 'Resume', required: true });
  });
});

describe('extract on snippets', () => {
  it('reads label[for], aria-labelledby, wrapping labels, legends and placeholders', () => {
    render(`
      <label for="a">Email *</label><input id="a" type="email">
      <span id="b-label">Phone</span><input aria-labelledby="b-label" type="tel">
      <label><span>City</span><input name="city"></label>
      <fieldset><legend>Pronouns</legend>
        <label><input type="checkbox" name="p" value="1"> She/her</label>
        <label><input type="checkbox" name="p" value="2"> They/them</label>
      </fieldset>
      <input name="q" placeholder="Your website">
      <select name="s"><option value="">Select...</option><option value="y">Yes</option></select>`);
    const fields = extractFields(document);
    expect(fields.map((f) => [f.fieldId, f.label, f.widget, f.required])).toEqual([
      ['a', 'Email', 'text', true],
      ['text', 'Phone', 'text', false],
      ['city', 'City', 'text', false],
      ['p', 'Pronouns', 'checkboxes', false],
      ['q', 'Your website', 'text', false],
      ['s', '', 'select', false],
    ]);
    expect(fields[3]?.options).toEqual(['She/her', 'They/them']);
    expect(fields[5]?.options).toEqual(['Yes']);
  });

  it('walks open shadow roots', () => {
    render('<div id="host"></div>');
    const host = document.getElementById('host');
    const shadow = host?.attachShadow({ mode: 'open' });
    if (shadow === undefined) throw new Error('no shadow root');
    shadow.innerHTML = '<label for="n">Full name</label><input id="n">';
    expect(extractFields(document).map((f) => f.label)).toEqual(['Full name']);
  });

  it('never reports hidden inputs, buttons or disabled controls', () => {
    render(`
      <input type="hidden" name="h"><input type="submit"><button>Next</button>
      <input name="d" disabled><div hidden><input name="x"></div>`);
    expect(extractFields(document)).toEqual([]);
  });
});
