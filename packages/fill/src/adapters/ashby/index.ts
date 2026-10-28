import type { FieldType } from '@employ-me/core';
import { postingKeyFromUrl } from '../../posting';
import type { ExtractedField } from '../../types';
import { adapter } from '../base';

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

function classify(field: ExtractedField): FieldType | null {
  const path = field.element.closest('[data-field-path]')?.getAttribute('data-field-path') ?? field.fieldId;
  const system = /_systemfield_[a-z_]+$/.exec(path)?.[0];
  return system === undefined ? null : (SYSTEM_FIELDS[system] ?? null);
}

export const ashbyAdapter = adapter({
  ats: 'ashby',
  findForm: (doc) =>
    doc.querySelector('#form[role="tabpanel"]') ??
    doc.querySelector('.ashby-application-form-container')?.parentElement ??
    null,
  postingKey: postingKeyFromUrl,
  classify,
  hooks: {
    ignore: (el) =>
      el.closest(
        '.ashby-application-form-autofill-uploader, [class*="autofill-input"], [class*="autofillPane"]',
      ) !== null,
    headings:
      '.ashby-application-form-section-header-description strong, .ashby-application-form-section-header-title',
  },
});
