import type { FieldType } from '@employ-me/core';
import { byName, isHidden } from '../../dom';
import type { Candidate, FieldOverrides } from '../../extract';
import { postingKeyFromUrl } from '../../posting';
import { bool, isRecord, list, parseJsonText, text } from '../../json';
import type { ExtractedField } from '../../types';
import { adapter } from '../base';

// Server-rendered with stable field names; a hidden cards[...][baseTemplate]
// input holds each question as JSON; resume upload triggers a parse that
// overwrites filled fields, so upload first (research §4).

const MAP: Readonly<Record<string, FieldType>> = {
  name: 'name.full',
  email: 'contact.email',
  phone: 'phone.full',
  location: 'address.location',
  org: 'work.currentEmployer',
  resume: 'file.resume',
  'urls[LinkedIn]': 'link.linkedin',
  'urls[GitHub]': 'link.github',
  'urls[Portfolio]': 'link.portfolio',
  'urls[Other]': 'link.other',
  'urls[Twitter]': 'link.other',
  pronouns: 'selfId.other',
  customPronounsOption: 'selfId.other',
  'eeo[gender]': 'selfId.us.sex',
  'eeo[race]': 'selfId.us.race',
  'eeo[veteran]': 'selfId.us.veteran',
  'eeo[disability]': 'selfId.us.disability',
  'eeo[disabilitySignature]': 'attestation.signature',
  'eeo[disabilitySignatureDate]': 'attestation.signature',
  'consent[marketing]': 'attestation.consent',
  'consent[store]': 'attestation.consent',
};

const QUESTION_NAME = /^(cards|surveysResponses)\[([^\]]+)\](?:\[responses\])?\[field(\d+)\]/;

/** One question from a card's or survey's baseTemplate JSON. */
function fromTemplate(candidate: Candidate): FieldOverrides | null {
  const name = candidate.members[0]?.getAttribute('name') ?? candidate.element.getAttribute('name') ?? '';
  const match = QUESTION_NAME.exec(name);
  if (match === null) return null;
  const [, kind, id, index] = match;
  const holder = byName(
    candidate.members[0] ?? candidate.element,
    `${kind ?? ''}[${id ?? ''}][baseTemplate]`,
  )[0];
  const template = parseJsonText(holder?.getAttribute('value'));
  if (!isRecord(template)) return null;
  const field = list(template['fields'])[Number(index)];
  if (!isRecord(field)) return null;
  const label = text(field['text']);
  const required = bool(field['required']);
  const description = text(field['description']);
  const section = text(template['text']);
  return {
    ...(label === undefined ? {} : { label }),
    ...(required === undefined ? {} : { required }),
    ...(description === undefined ? {} : { description }),
    ...(section === undefined ? {} : { section }),
  };
}

function describe(candidate: Candidate): FieldOverrides | null {
  if (candidate.element.matches('input.location-input, #location-input')) return { widget: 'typeahead' };
  return fromTemplate(candidate);
}

function classify(field: ExtractedField): FieldType | null {
  if (field.name !== undefined && MAP[field.name] !== undefined) return MAP[field.name] ?? null;
  if (field.fieldId === 'additional-information' || field.name === 'comments') return 'freeText.question';
  return null;
}

const PARSE_TIMEOUT_MS = 20_000;

export const leverAdapter = adapter({
  ats: 'lever',
  findForm: (doc) => doc.querySelector('#application-form, form.application-form, form[action*="apply"]'),
  postingKey: postingKeyFromUrl,
  classify,
  hooks: {
    describe,
    // "Apply with LinkedIn" is never used (design.md "What it is").
    ignore: (el) => el.closest('.awli-application-row, .awli-button-container') !== null,
  },
  parsesResume: true,
  async waitForResumeParse(form) {
    const doc = form.ownerDocument;
    const shown = (selector: string) => {
      const el = doc.querySelector(selector);
      return el !== null && !isHidden(el);
    };
    const deadline = Date.now() + PARSE_TIMEOUT_MS;
    // Wait for the "Reading your resume" banner, then for it to go away.
    await new Promise((resolve) => setTimeout(resolve, 300));
    while (Date.now() < deadline && shown('.resume-upload-working')) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  },
  checkStrategy: 'events',
  typeaheadSuggestions: (input) => [
    ...input.ownerDocument.querySelectorAll('.dropdown-results .dropdown-location'),
  ],
});
