import {
  byName,
  collapse,
  deepQueryAll,
  inputType,
  isHidden,
  isInput,
  parentElement,
  readableText,
} from '../dom';
import type { Choice, Widget } from '../types';
import { optionLabel } from './label';

// Finds the fillable things in a form, before labels: single controls, and
// groups (radios sharing a name, checkboxes sharing a name, answer buttons).

export interface Candidate {
  /** The control, or the container of a group. */
  readonly element: Element;
  readonly widget: Widget;
  /** Group members (radios, checkboxes, buttons). Empty for single controls. */
  readonly members: readonly Element[];
  readonly choices: readonly Choice[];
}

const CONTROLS = 'input, textarea, select, [role="combobox"], button[aria-haspopup="listbox"]';
const SKIPPED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset']);
const ANSWER_BUTTON = 'button[aria-pressed], [role="button"][aria-pressed], [role="radio"]';

export function findCandidates(
  root: ParentNode,
  isIgnored: (el: Element) => boolean,
  /** The container of a select-all-that-apply question whose checkboxes each have their own name. */
  checkboxGroupOf: (checkbox: Element) => Element | null = () => null,
): Candidate[] {
  const consumed = new Set<Element>();
  const found: Candidate[] = [];

  for (const el of deepQueryAll(root, `${CONTROLS}, ${ANSWER_BUTTON}`)) {
    if (consumed.has(el) || isIgnored(el) || skipped(el)) continue;

    const container = isInput(el) && inputType(el) === 'checkbox' ? checkboxGroupOf(el) : null;
    const grouped =
      container === null
        ? []
        : [...container.querySelectorAll('input[type="checkbox"]')].filter(
            (m) => !isIgnored(m) && !skipped(m),
          );
    if (container !== null && grouped.length > 1) {
      grouped.forEach((m) => consumed.add(m));
      found.push({
        element: container,
        widget: 'checkboxes',
        members: grouped,
        choices: grouped.map((m) => ({ label: optionLabel(m), element: m })),
      });
      continue;
    }

    if (el.matches(ANSWER_BUTTON)) {
      const group = buttonGroup(el);
      if (group === null) continue;
      group.members.forEach((m) => consumed.add(m));
      if (group.hiddenInput !== null) consumed.add(group.hiddenInput);
      found.push(group.candidate);
      continue;
    }

    if (isInput(el) && inputType(el) === 'checkbox') {
      const group = buttonGroup(el);
      if (group !== null) {
        group.members.forEach((m) => consumed.add(m));
        consumed.add(el);
        found.push(group.candidate);
        continue;
      }
    }

    if (isInput(el) && (inputType(el) === 'radio' || inputType(el) === 'checkbox')) {
      const members = sameName(el);
      members.forEach((m) => consumed.add(m));
      const widget: Widget =
        inputType(el) === 'radio' ? 'radios' : members.length > 1 ? 'checkboxes' : 'checkbox';
      found.push({
        element: members.length > 1 ? commonAncestor(members) : el,
        widget,
        members,
        choices: members.map((m) => ({ label: optionLabel(m), element: m })),
      });
      continue;
    }

    consumed.add(el);
    found.push({ element: el, widget: widgetOf(el), members: [], choices: nativeChoices(el) });
  }
  return found;
}

function skipped(el: Element): boolean {
  if (isInput(el) && SKIPPED_INPUT_TYPES.has(inputType(el))) return true;
  if (/captcha/i.test(el.getAttribute('name') ?? '') || /captcha/i.test(el.id)) return true;
  if (el.hasAttribute('disabled')) return true;
  // react-select's hidden "required" mirror, and similar plumbing.
  if (el.getAttribute('aria-hidden') === 'true') return true;
  // Search boxes inside an open popup (e.g. intl-tel-input's country search).
  if (el.closest('[role="dialog"], [role="listbox"], [role="menu"]') !== null) return true;
  if (isInput(el) && inputType(el) === 'checkbox' && el.getAttribute('tabindex') === '-1') {
    // A hidden checkbox behind answer buttons is consumed by its button group instead.
    return buttonGroup(el) === null && isHidden(el);
  }
  if (el.matches(ANSWER_BUTTON)) return isHidden(el);
  if (isInput(el) && inputType(el) === 'file') return false;
  return isHidden(el);
}

function widgetOf(el: Element): Widget {
  if (el.localName === 'textarea') return 'textarea';
  if (el.localName === 'select') return el.hasAttribute('multiple') ? 'selectMultiple' : 'select';
  if (isInput(el) && inputType(el) === 'file') return 'file';
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
    return isMultiCombobox(el) ? 'comboboxMultiple' : 'combobox';
  }
  return 'text';
}

function isMultiCombobox(el: Element): boolean {
  if (el.getAttribute('aria-multiselectable') === 'true') return true;
  let node: Element | null = parentElement(el);
  for (let depth = 0; node !== null && depth < 5; depth++, node = parentElement(node)) {
    if (/--is-multi|multi-?value|multiselect/i.test(node.getAttribute('class') ?? '')) return true;
  }
  return false;
}

function nativeChoices(el: Element): Choice[] {
  if (el.localName !== 'select') return [];
  return [...el.querySelectorAll('option')]
    .filter((option) => !isPlaceholderOption(option))
    .map((option) => ({ label: collapse(option.textContent), element: option, value: optionValue(option) }));
}

/** An <option>'s value: its value attribute, else its text (as browsers do). */
function optionValue(option: Element): string {
  return option.getAttribute('value') ?? collapse(option.textContent);
}

function isPlaceholderOption(option: Element): boolean {
  const value = option.getAttribute('value');
  const text = collapse(option.textContent);
  if (option.hasAttribute('disabled') && (value === null || value === '')) return true;
  return (value === '' || value === null) && /^(select|choose|click here|--|please select|\s*$)/i.test(text);
}

function sameName(el: Element): Element[] {
  const name = el.getAttribute('name');
  if (name === null || name === '') return [el];
  const members = byName(el, name).filter((m) => m.getAttribute('type') === el.getAttribute('type'));
  return members.length === 0 ? [el] : members;
}

interface ButtonGroup {
  readonly candidate: Candidate;
  readonly members: readonly Element[];
  readonly hiddenInput: Element | null;
}

/**
 * Answer buttons that sit together (Ashby's Yes/No over a hidden checkbox).
 * Found from either a button or the hidden checkbox.
 */
function buttonGroup(from: Element): ButtonGroup | null {
  const parent = parentElement(from);
  if (parent === null) return null;
  const buttons = [...parent.children].filter((child) => child.matches(ANSWER_BUTTON));
  if (buttons.length < 2) return null;
  const hiddenInput =
    [...parent.children].find((child) => isInput(child) && inputType(child) === 'checkbox') ?? null;
  return {
    candidate: {
      element: parent,
      widget: 'buttons',
      members: buttons,
      choices: buttons.map((b) => ({ label: readableText(b), element: b })),
    },
    members: buttons,
    hiddenInput,
  };
}

function commonAncestor(elements: readonly Element[]): Element {
  const [first] = elements;
  if (first === undefined) throw new Error('commonAncestor needs at least one element');
  let node: Element | null = parentElement(first);
  while (node !== null) {
    const candidate = node;
    if (elements.every((el) => candidate.contains(el))) return candidate;
    node = parentElement(node);
  }
  return first;
}
