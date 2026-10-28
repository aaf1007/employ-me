import type { ControlKind } from '@employ-me/core';
import { byId, cleanLabel, inputType, labelMarksRequired, readableText, rememberedOptions } from '../dom';
import type { ExtractedField, Widget } from '../types';
import { findCandidates, type Candidate } from './candidates';
import { controlLabel, describedBy, groupQuestion, optionLabel } from './label';
import { indexSections } from './section';

export { optionLabel } from './label';

/** What an adapter knows better than the generic rules. Every hook is optional. */
export interface ExtractHooks {
  /** Elements to leave out (LinkedIn widgets, "Autofill from resume" boxes). */
  readonly ignore?: (el: Element) => boolean;
  /** Overrides from the ATS's own data, e.g. Lever's baseTemplate JSON. */
  readonly describe?: (candidate: Candidate) => FieldOverrides | null;
  /** Extra section headings, e.g. Greenhouse's "Education" header. */
  readonly headings?: string;
  /**
   * The container of a select-all-that-apply question, for ATSs that give
   * each checkbox in it a name of its own (Ashby names them by their option).
   */
  readonly checkboxGroup?: (checkbox: Element) => Element | null;
}

export interface FieldOverrides {
  readonly label?: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly section?: string;
  readonly widget?: Widget;
  readonly fieldId?: string;
}

export type { Candidate } from './candidates';

const MAX_OPTIONS = 1000;
const MAX_OPTION_LENGTH = 500;
const MAX_LABEL_LENGTH = 2000;

/**
 * Generic extraction: every fillable control under `root` as
 * `{ fieldId, label, section, control, options, required, maxLength }`
 * (research §6 step 2). Walks open shadow roots. Read-only: never writes to
 * the DOM.
 */
export function extractFields(root: ParentNode, hooks: ExtractHooks = {}): ExtractedField[] {
  const isIgnored = hooks.ignore ?? (() => false);
  const sections = indexSections(root, hooks.headings, isIgnored);
  const ids = new Map<string, number>();
  const fields: ExtractedField[] = [];
  for (const candidate of findCandidates(root, isIgnored, hooks.checkboxGroup)) {
    const overrides = hooks.describe?.(candidate) ?? {};
    const widget = overrides.widget ?? candidate.widget;
    const rawLabel = overrides.label ?? rawLabelOf(candidate);
    const label = cleanLabel(rawLabel).slice(0, MAX_LABEL_LENGTH);
    const options = optionsOf(candidate, widget);
    const description = overrides.description ?? descriptionOf(candidate);
    const section = overrides.section ?? sections.sectionOf(candidate.element);
    const maxLength = maxLengthOf(candidate.element);
    const name = candidate.element.getAttribute('name') ?? candidate.members[0]?.getAttribute('name');
    const autocomplete = candidate.element.getAttribute('autocomplete');
    fields.push({
      fieldId: uniqueId(overrides.fieldId ?? baseId(candidate), ids),
      label,
      control: controlKind(candidate.element, widget),
      options: options.slice(0, MAX_OPTIONS).map((o) => o.slice(0, MAX_OPTION_LENGTH)),
      required: overrides.required ?? isRequired(candidate, rawLabel),
      ...(section === undefined || section === label ? {} : { section: section.slice(0, 500) }),
      ...(description === '' ? {} : { description: description.slice(0, 4000) }),
      ...(maxLength === undefined ? {} : { maxLength }),
      element: candidate.element,
      widget,
      choices: candidate.choices,
      ...(name === null || name === undefined || name === '' ? {} : { name }),
      ...(autocomplete === null || autocomplete === '' ? {} : { autocomplete }),
    });
  }
  return fields;
}

function rawLabelOf(candidate: Candidate): string {
  const { element, members, widget } = candidate;
  if (widget === 'checkbox') {
    // A lone checkbox is its own statement ("I agree to…"), unless its label is
    // a short answer ("Yes") to a question above it.
    const own = optionLabel(element);
    if (own.length > 40) return own;
    const question = groupQuestion(element, [element]);
    return question !== '' ? question : own;
  }
  if (members.length > 0) return groupQuestion(element, members);
  return controlLabel(element);
}

function optionsOf(candidate: Candidate, widget: Widget): readonly string[] {
  if (candidate.choices.length > 0) {
    if (widget === 'checkbox') {
      const own = candidate.choices[0]?.label ?? '';
      // A lone checkbox's own label is an option only when it's short ("Yes"), not the statement itself.
      return own.length > 0 && own.length <= 60 ? [own] : [];
    }
    return candidate.choices.map((c) => c.label);
  }
  if (widget === 'combobox' || widget === 'comboboxMultiple') return comboboxOptions(candidate.element);
  return [];
}

/** Options of an open listbox the combobox controls, else the ones act/ saw last time. */
function comboboxOptions(el: Element): readonly string[] {
  for (const attribute of ['aria-controls', 'aria-owns']) {
    const id = el.getAttribute(attribute);
    if (id === null || id === '') continue;
    const listbox = byId(el, id);
    if (listbox === null) continue;
    const options = [...listbox.querySelectorAll('[role="option"]')].map((o) => readableText(o));
    if (options.length > 0) return options;
  }
  return rememberedOptions(el);
}

function descriptionOf(candidate: Candidate): string {
  const target = candidate.members[0] ?? candidate.element;
  const fromAria = describedBy(target);
  if (fromAria !== '') return fromAria;
  const entry = candidate.element.closest('[data-field-path], .application-question');
  const description = entry?.querySelector('[class*="description"]');
  return description === null || description === undefined ? '' : readableText(description);
}

function isRequired(candidate: Candidate, rawLabel: string): boolean {
  const targets = [candidate.element, ...candidate.members];
  if (targets.some((t) => t.hasAttribute('required') || t.getAttribute('aria-required') === 'true')) {
    return true;
  }
  if (labelMarksRequired(rawLabel)) return true;
  const entry = candidate.element.closest('[data-field-path], .application-question, .field-wrapper');
  const title = entry?.querySelector('label, legend, [class*="question-title"], [class*="label"]');
  return /required/i.test(title?.getAttribute('class') ?? '');
}

function maxLengthOf(el: Element): number | undefined {
  const raw = el.getAttribute('maxlength');
  if (raw === null) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function controlKind(el: Element, widget: Widget): ControlKind {
  switch (widget) {
    case 'textarea':
      return 'textarea';
    case 'select':
    case 'selectMultiple':
      return 'select';
    case 'combobox':
    case 'comboboxMultiple':
    case 'typeahead':
      return 'combobox';
    case 'radios':
    case 'buttons':
      return 'radioGroup';
    case 'checkbox':
      return 'checkbox';
    case 'checkboxes':
      return 'checkboxGroup';
    case 'file':
      return 'file';
    case 'text': {
      const type = inputType(el);
      return type === 'email' || type === 'tel' || type === 'url' || type === 'number' || type === 'date'
        ? type
        : 'text';
    }
  }
}

function baseId(candidate: Candidate): string {
  const el = candidate.element;
  const first = candidate.members[0];
  const name = first?.getAttribute('name') ?? el.getAttribute('name');
  if (candidate.members.length > 0 && name !== null && name !== '') return name;
  const id = el.getAttribute('id');
  if (id !== null && id !== '') return id;
  if (name !== null && name !== '') return name;
  const path = el.closest('[data-field-path]')?.getAttribute('data-field-path');
  if (path !== undefined && path !== null && path !== '') return path;
  const tagged = el.getAttribute('data-qa') ?? el.getAttribute('data-testid');
  if (tagged !== null && tagged !== '') return tagged;
  return candidate.widget;
}

function uniqueId(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return (count === 0 ? base : `${base}#${count + 1}`).slice(0, 200);
}
