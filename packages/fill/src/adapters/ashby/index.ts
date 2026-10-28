import type { FieldType } from '@employ-me/core';
import { readableText } from '../../dom';
import type { Candidate, FieldOverrides } from '../../extract';
import { postingKeyFromUrl } from '../../posting';
import type { ExtractedField } from '../../types';
import { adapter, shownByInput } from '../base';
import type { ShownFile } from '../types';

// Elements carry [data-field-path] (_systemfield_*); Yes/No answers are
// buttons over a hidden checkbox (research §4). The "Autofill from resume"
// box is left alone: employ-me fills the fields itself.

const SYSTEM_FIELDS: Readonly<Record<string, FieldType>> = {
  _systemfield_name: 'name.full',
  _systemfield_email: 'contact.email',
  _systemfield_phone: 'phone.full',
  _systemfield_resume: 'file.resume',
  _systemfield_location: 'address.location',
  _systemfield_eeoc_gender: 'selfId.us.sex',
  _systemfield_eeoc_race: 'selfId.us.race',
  _systemfield_eeoc_veteran_status: 'selfId.us.veteran',
  _systemfield_eeoc_disability_status: 'selfId.us.disability',
  _systemfield_recording_consent: 'attestation.consent',
};

const CHECKBOX_GROUP = '.ashby-application-form-input-checkbox-group';

function classify(field: ExtractedField): FieldType | null {
  const path = field.element.closest('[data-field-path]')?.getAttribute('data-field-path') ?? field.fieldId;
  const system = /_systemfield_[a-z_]+$/.exec(path)?.[0];
  return system === undefined ? null : (SYSTEM_FIELDS[system] ?? null);
}

/** Ashby lists an attached file by name under the question, with Delete and Replace. */
function shownFile(field: ExtractedField): ShownFile {
  const entry = field.element.closest('[data-field-path]');
  if (entry === null) return shownByInput(field);
  if (entry.querySelector('[role="progressbar"]') !== null) return { kind: 'uploading' };
  const name = readableText(entry.querySelector('.ashby-application-form-input-file-item-name'));
  return name === '' ? shownByInput(field) : { kind: 'named', text: name };
}

export const ashbyAdapter = adapter({
  ats: 'ashby',
  findForm: (doc) =>
    doc.querySelector('#form[role="tabpanel"]') ??
    doc.querySelector('.ashby-application-form-container')?.parentElement ??
    null,
  postingKey: postingKeyFromUrl,
  classify,
  shownFile,
  hooks: {
    ignore: (el) =>
      el.closest(
        '.ashby-application-form-autofill-uploader, [class*="autofill-input"], [class*="autofillPane"]',
      ) !== null,
    headings:
      '.ashby-application-form-section-header-description strong, .ashby-application-form-section-header-title',
    // A select-all-that-apply question names each checkbox after its option: it is one field.
    checkboxGroup: (checkbox) => checkbox.closest(CHECKBOX_GROUP),
    describe,
  },
});

function describe(candidate: Candidate): FieldOverrides | null {
  if (candidate.widget === 'checkboxes' && candidate.element.matches(CHECKBOX_GROUP)) {
    const path = candidate.element.closest('[data-field-path]')?.getAttribute('data-field-path');
    return path === null || path === undefined || path === '' ? null : { fieldId: path };
  }
  // The SMS and WhatsApp consent radios sit inside the Phone field: name them by their own heading.
  const consent = candidate.element.closest('[class*="consentRadioGroupItem"]');
  if (candidate.widget === 'radios' && consent !== null) {
    const channel = readableText(consent.querySelector('[class*="consentRadioGroupItemLabel"]'));
    return { label: `${channel === '' ? 'Text' : channel} messages about your application: do you consent?` };
  }
  return null;
}
