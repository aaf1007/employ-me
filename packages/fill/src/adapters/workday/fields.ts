import {
  cleanLabel,
  cssString,
  deepQueryAll,
  labelMarksRequired,
  parentElement,
  readableText,
  rootScope,
} from '../../dom';
import type { Candidate, FieldOverrides } from '../../extract';
import type { Widget } from '../../types';

// How Workday names its fields. Two schemes are live (research §4, §10):
// the current one puts the field's path in its id, joined by "--"
// (`name--legalName--firstName`, `workExperience-23--jobTitle`, as in
// Workday's public apply-flow bundle); the classic one names the control in
// `data-automation-id` (`legalNameSection_firstName`) and repeating entries
// in their container (`workExperience-1`). Entries are numbered by a global
// counter, so a field's entry is its position, not that number.

export type DatePart = 'month' | 'day' | 'year';

export interface Entry {
  readonly kind: string;
  readonly number: number;
}

export interface FieldKey {
  /** `name--legalName--firstName`, `legalNameSection_firstName`, `workExperience--jobTitle`. */
  readonly key: string;
  readonly part?: DatePart;
  readonly entry: Entry | null;
}

const ENTRY_KINDS = 'workExperience|education|languages?|websites?|certifications?';
const ENTRY_FIELD = new RegExp(`^(${ENTRY_KINDS})-(\\d+)--(.+)$`);
const ENTRY_CONTAINER = new RegExp(`^(${ENTRY_KINDS})-(\\d+)$`);
const DATE_SEGMENT = /(?:^|-)dateSection(Month|Day|Year)-input$/;
/** Automation ids that name a widget's plumbing, not the field. */
const PLUMBING =
  /^(applyFlow|formField-|dateSection|dateInput|dateIcon|multiselect|multiSelect|selectedItem|searchBox|click_filter|file-upload-(drop-zone|item|successful|failed)|select-files|add-button|panel|pageFooter|progressBar|promptOption|activeListContainer|richText)/;
const MULTI_PROMPT = /(^|--)(skills|ethnicityMulti)$/;

/** The step page or sign-in panel a field sits in, for scoped lookups. */
const SCOPE =
  '[data-automation-id^="applyFlow"][data-automation-id$="Page"], [data-automation-id="signInContent"]';

export function fieldKeyOf(el: Element): FieldKey | null {
  const part = datePartOf(el);
  const entry = entryOf(el);
  const leaf = leafOf(el);
  if (leaf === null) return null;
  const inEntry = entry === null ? null : ENTRY_FIELD.exec(leaf);
  const name = inEntry?.[3] ?? leaf;
  return {
    key: entry === null ? name : `${entry.kind}--${name}`,
    ...(part === undefined ? {} : { part }),
    entry,
  };
}

/** The extract/ override for one candidate: a stable field id, the label Workday shows, the widget. */
export function describe(candidate: Candidate): FieldOverrides | null {
  const el = candidate.members[0] ?? candidate.element;
  const found = fieldKeyOf(el);
  const overrides: { -readonly [K in keyof FieldOverrides]: FieldOverrides[K] } = {};
  if (found !== null) overrides.fieldId = fieldIdOf(found, el);
  const label = labelOf(candidate, found?.part);
  if (label !== null) {
    overrides.label = label.text;
    if (label.required) overrides.required = true;
  }
  const widget = widgetOf(candidate, found);
  if (widget !== null) overrides.widget = widget;
  return Object.keys(overrides).length === 0 ? null : overrides;
}

/** `workExperience--startDate-month--0`: answer/ reads the trailing `--N` as the Profile entry. */
export function fieldIdOf(found: FieldKey, el: Element): string {
  const part = found.part === undefined ? '' : `-${found.part}`;
  const index = found.entry === null ? '' : `--${String(entryIndex(found.entry, el))}`;
  return `${found.key}${part}${index}`;
}

/** The key a field id was built from: id minus its entry index, date part and duplicate counter. */
export function keyOfFieldId(fieldId: string): string {
  return fieldId
    .replace(/#\d+$/, '')
    .replace(/--\d+$/, '')
    .replace(/-(month|day|year)$/, '');
}

export function entryOf(el: Element): Entry | null {
  const own = ENTRY_FIELD.exec(stripSegment(el.id));
  if (own?.[1] !== undefined) return { kind: kindOf(own[1]), number: Number(own[2]) };
  for (let node = parentElement(el); node !== null; node = parentElement(node)) {
    for (const value of [node.getAttribute('data-automation-id'), node.id]) {
      const container = ENTRY_CONTAINER.exec(value ?? '');
      if (container?.[1] !== undefined) return { kind: kindOf(container[1]), number: Number(container[2]) };
      const path = ENTRY_FIELD.exec(value ?? '');
      if (path?.[1] !== undefined) return { kind: kindOf(path[1]), number: Number(path[2]) };
    }
    if (node.matches(SCOPE)) break;
  }
  return null;
}

/** Entry numbers of one kind in document order: the first is Profile entry 0, and so on. */
export function entryNumbers(scope: ParentNode, kind: string): number[] {
  const numbers: number[] = [];
  for (const node of deepQueryAll(scope, '[id], [data-automation-id]')) {
    for (const value of [node.id, node.getAttribute('data-automation-id') ?? '']) {
      const match = ENTRY_FIELD.exec(value) ?? ENTRY_CONTAINER.exec(value);
      if (match?.[1] === undefined || kindOf(match[1]) !== kind) continue;
      const number = Number(match[2]);
      if (!numbers.includes(number)) numbers.push(number);
    }
  }
  return numbers;
}

function entryIndex(entry: Entry, el: Element): number {
  const scope = el.closest(SCOPE) ?? el.ownerDocument;
  const index = entryNumbers(scope, entry.kind).indexOf(entry.number);
  return index === -1 ? 0 : index;
}

/** "languages" and "language" are one kind. */
function kindOf(raw: string): string {
  return raw.replace(/s$/, '');
}

function datePartOf(el: Element): DatePart | undefined {
  const match = DATE_SEGMENT.exec(el.getAttribute('data-automation-id') ?? '') ?? DATE_SEGMENT.exec(el.id);
  const part = match?.[1]?.toLowerCase();
  return part === 'month' || part === 'day' || part === 'year' ? part : undefined;
}

function stripSegment(id: string): string {
  return id.replace(/-dateSection(Month|Day|Year)-input$/, '');
}

/**
 * The field's own name: a path id, else a meaningful automation id, else its
 * `formField-` wrapper, looking from the control outwards.
 */
function leafOf(el: Element): string | null {
  let node: Element | null = el;
  for (let depth = 0; node !== null && depth < 8; depth++, node = parentElement(node)) {
    const id = stripSegment(node.id);
    if (id.includes('--')) return id;
    const automation = node.getAttribute('data-automation-id') ?? '';
    if (automation.startsWith('formField-') && automation.length > 'formField-'.length) {
      return automation.slice('formField-'.length);
    }
    if (automation !== '' && !PLUMBING.test(automation) && !ENTRY_CONTAINER.test(automation))
      return automation;
    if (node.matches(SCOPE)) break;
  }
  return null;
}

interface Label {
  readonly text: string;
  readonly required: boolean;
}

/**
 * Labels the generic rules would get wrong: a lone checkbox is its own
 * statement ("I currently work here"), not its entry's first label; a date
 * box is "From (Month)". Others come from `label[for]` as usual.
 */
function labelOf(candidate: Candidate, part: DatePart | undefined): Label | null {
  const el = candidate.members[0] ?? candidate.element;
  if (candidate.widget === 'checkbox') {
    const own = labelForId(el);
    return own === '' ? null : { text: own, required: false };
  }
  if (part === undefined && labelForId(el) !== '') return null;
  const wrapper = el.closest('[data-automation-id^="formField-"]');
  const raw = labelForId(el) || wrapperLabel(wrapper);
  if (raw === '') return null;
  const required = labelMarksRequired(raw) || el.getAttribute('aria-required') === 'true';
  if (part === undefined) return { text: raw, required };
  return { text: `${cleanLabel(raw)} (${part.charAt(0).toUpperCase()}${part.slice(1)})`, required };
}

function labelForId(el: Element): string {
  if (el.id === '') return '';
  const label = rootScope(el).querySelector(`label[for="${cssString(el.id)}"]`);
  return readableText(label);
}

function wrapperLabel(wrapper: Element | null): string {
  if (wrapper === null) return '';
  const label = wrapper.querySelector('label, legend');
  return readableText(label);
}

/** Workday's prompts are search boxes over a popup list: comboboxes, some of them multi-select. */
function widgetOf(candidate: Candidate, found: FieldKey | null): Widget | null {
  const el = candidate.element;
  if (el.localName !== 'input' || candidate.members.length > 0) return null;
  const prompt =
    el.getAttribute('data-automation-id') === 'searchBox' ||
    el.closest('[data-automation-id="multiselectInputContainer"]') !== null;
  if (!prompt) return null;
  const multi = el.getAttribute('aria-multiselectable') === 'true' || MULTI_PROMPT.test(found?.key ?? '');
  return multi ? 'comboboxMultiple' : 'combobox';
}
