import type { FieldType } from '@employ-me/core';
import { postingKeyFromUrl } from '../../posting';
import type { ExtractedField } from '../../types';
import { adapter } from '../base';
import type { RepeatingSection } from '../types';

// Single page, field ids match API names (first_name, question_{id}); every
// dropdown is a react-select; often embedded as iframe#grnhse_iframe
// (research §4). The standard fields and the US EEOC block have fixed ids.

const MAP: Readonly<Record<string, FieldType>> = {
  first_name: 'name.first',
  last_name: 'name.last',
  preferred_name: 'name.preferred',
  email: 'contact.email',
  // The phone box sits beside a "Country" picker that sets its dialling code.
  phone: 'phone.number',
  country: 'phone.countryCode',
  'candidate-location': 'address.location',
  resume: 'file.resume',
  cover_letter: 'file.coverLetter',
  resume_text: 'file.resume',
  cover_letter_text: 'freeText.coverLetter',
  gender: 'selfId.us.sex',
  hispanic_ethnicity: 'selfId.us.hispanicLatino',
  race: 'selfId.us.race',
  veteran_status: 'selfId.us.veteran',
  disability_status: 'selfId.us.disability',
};

/** Repeating education and employment entries: school--0, degree--1, company-name--0… */
const REPEATED: ReadonlyArray<readonly [RegExp, FieldType]> = [
  [/^school--\d+$/, 'edu.school'],
  [/^degree--\d+$/, 'edu.degree'],
  [/^discipline--\d+$/, 'edu.discipline'],
  [/^(start-date|start_date)-(month|year)--\d+$/, 'edu.startDate'],
  [/^(end-date|end_date)-(month|year)--\d+$/, 'edu.endDate'],
  [/^company-name--\d+$/, 'work.employer'],
  [/^title--\d+$/, 'work.title'],
  [/^gdpr_/, 'attestation.consent'],
];

function classify(field: ExtractedField): FieldType | null {
  const known = MAP[field.fieldId];
  if (known !== undefined) return known;
  return REPEATED.find(([re]) => re.test(field.fieldId))?.[1] ?? null;
}

export const greenhouseAdapter = adapter({
  ats: 'greenhouse',
  findForm: (doc) => doc.querySelector('#application-form, form.application--form, #application_form'),
  postingKey: postingKeyFromUrl,
  classify,
  hooks: { headings: '.education--header, .employment--header' },
  repeatingSections(form) {
    const sections: RepeatingSection[] = [];
    for (const [section, container, first] of [
      ['education', '.education--container', 'input[id^="school--"]'],
      ['work', '.employment--container', 'input[id^="company-name--"]'],
    ] as const) {
      const box = form.querySelector(container);
      if (box === null) continue;
      sections.push({
        section,
        entries: box.querySelectorAll(first).length,
        addButton: box.querySelector('button.add-another-button'),
      });
    }
    return sections;
  },
});
