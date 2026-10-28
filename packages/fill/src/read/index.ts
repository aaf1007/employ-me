import { sensitivityOf, type FieldType, type SubmittedAnswer } from '@employ-me/core';
import { isChecked, isPressed } from '../act';
import { isInput, isSelect, readableText } from '../dom';
import type { ExtractedField } from '../types';

// What each field shows now, read from the page (never written). Used for a
// Submission's Snapshot ("the answers you submitted", design.md "Tracking")
// and to tell a field the user edited apart from one a Fill left alone.

export type FieldValue = SubmittedAnswer['value'];

/** The value a field shows, in the form's own words. Null when the field is gone from the page. */
export function readFieldValue(field: ExtractedField): FieldValue | null {
  const el = field.element;
  if (!el.isConnected) return null;
  switch (field.widget) {
    case 'text':
    case 'textarea':
    case 'typeahead':
      return isInput(el) || el.localName === 'textarea' ? valueOf(el) : readableText(el);
    case 'select':
      return selectedTexts(el)[0] ?? '';
    case 'selectMultiple':
      return selectedTexts(el);
    case 'combobox':
      return comboboxValues(el)[0] ?? '';
    case 'comboboxMultiple':
      return comboboxValues(el);
    case 'radios':
      return field.choices.find((c) => isChecked(c.element))?.label ?? '';
    case 'checkbox':
      return isChecked(field.choices[0]?.element ?? el);
    case 'checkboxes':
      return field.choices.filter((c) => isChecked(c.element)).map((c) => c.label);
    case 'buttons': {
      const pressed = field.choices.filter((c) => isPressed(c.element)).map((c) => c.label);
      return pressed.length > 1 ? pressed : (pressed[0] ?? '');
    }
    case 'file':
      return isInput(el) ? [...(el.files ?? [])].map((f) => f.name) : [];
  }
}

/** A field's value as one comparable string. */
export function fieldFingerprint(field: ExtractedField): string {
  return JSON.stringify(readFieldValue(field));
}

/**
 * The answers a Snapshot keeps: every answered field the page still shows,
 * Self-ID included (Snapshots stay on the machine). Files are left out (the
 * Snapshot names the Resume), and so is anything never stored: passwords,
 * SIN/SSN, date of birth, references and signatures (design.md "Profile").
 */
export function submittedAnswers(
  fields: readonly { readonly field: ExtractedField; readonly fieldType: FieldType }[],
): SubmittedAnswer[] {
  const answers: SubmittedAnswer[] = [];
  for (const { field, fieldType } of fields) {
    if (!keptInSnapshot(field, fieldType)) continue;
    const value = readFieldValue(field);
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    answers.push({ label: field.label === '' ? field.fieldId : field.label, fieldType, value });
  }
  return answers;
}

export function keptInSnapshot(field: ExtractedField, fieldType: FieldType): boolean {
  return (
    field.widget !== 'file' &&
    sensitivityOf(fieldType) !== 'neverStored' &&
    fieldType !== 'attestation.signature'
  );
}

function valueOf(el: Element): string {
  return 'value' in el && typeof el.value === 'string' ? el.value : '';
}

function selectedTexts(el: Element): string[] {
  if (!isSelect(el)) return [];
  return [...el.selectedOptions].filter((o) => o.value !== '').map((o) => o.text.replace(/\s+/g, ' ').trim());
}

/** react-select shows its choice beside the input, in the control container; Ashby keeps it in the input. */
function comboboxValues(el: Element): string[] {
  const control = el.closest('[class*="control"], [class*="Control"], .select-shell');
  if (control !== null) {
    const chosen = [
      ...control.querySelectorAll(
        '[class*="single-value"], [class*="singleValue"], [class*="multi-value__label"], [class*="multiValue"] > :first-child',
      ),
    ]
      .map((c) => readableText(c))
      .filter((t) => t !== '');
    if (chosen.length > 0) return chosen;
  }
  const typed = valueOf(el);
  if (typed !== '') return [typed];
  return isInput(el) ? [] : [readableText(el)].filter((t) => t !== '');
}
