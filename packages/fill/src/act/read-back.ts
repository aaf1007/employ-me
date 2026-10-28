import { err, ok, normalizeLabel } from '@employ-me/core';
import {
  byId,
  cssString,
  isHidden,
  isInput,
  isSelect,
  isTextArea,
  parentElement,
  readableText,
  rootScope,
} from '../dom';
import { delay } from './events';
import type { ActResult } from './types';

// Read-backs: after every write, act/ checks the page kept the value
// (CODING_STANDARDS.md "Fill outcomes"). These only read.

export type TextCheck = 'exact' | 'digits' | 'loose';

export function currentValue(el: Element): string {
  if (isInput(el) || isTextArea(el) || isSelect(el)) return el.value;
  return readableText(el);
}

export function valueMatches(actual: string, wanted: string, check: TextCheck): boolean {
  switch (check) {
    case 'exact':
      return actual === wanted;
    case 'digits':
      return (
        actual.replace(/\D/g, '').endsWith(wanted.replace(/\D/g, '')) && wanted.replace(/\D/g, '') !== ''
      );
    case 'loose':
      return normalizeLabel(actual) === normalizeLabel(wanted);
  }
}

export function isChecked(el: Element): boolean {
  if (isInput(el)) return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}

export function isPressed(el: Element): boolean {
  if (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true') return true;
  return /(^|[\s_-])(active|selected|is-selected|checked)([\s_-]|$)/i.test(el.getAttribute('class') ?? '');
}

/** The listbox a combobox controls, if its menu is open. */
export function listboxOf(combobox: Element): Element | null {
  for (const attribute of ['aria-controls', 'aria-owns']) {
    const id = combobox.getAttribute(attribute);
    const listbox = id === null || id === '' ? null : byId(combobox, id);
    if (listbox !== null) return listbox;
  }
  const id = combobox.getAttribute('id');
  if (id !== null && id !== '') {
    const reactSelect = byId(combobox, `react-select-${id}-listbox`);
    if (reactSelect !== null) return reactSelect;
  }
  // Menus rendered inside the combobox's own container (react-select without ids, Ashby).
  let node: Element | null = parentElement(combobox);
  for (let depth = 0; node !== null && depth < 5; depth++, node = parentElement(node)) {
    const inside = node.querySelector('[role="listbox"]');
    if (inside !== null && inside !== combobox && !isHidden(inside)) return inside;
  }
  // Headless UI and other portals: the single open listbox in the document.
  // Hidden lists (intl-tel-input keeps its country list in the page) don't count.
  const open = [...rootScope(combobox).querySelectorAll('[role="listbox"]')].filter(
    (lb) => lb.querySelector('[role="option"]') !== null && !isHidden(lb),
  );
  return open.length === 1 ? (open[0] ?? null) : null;
}

export function optionsIn(listbox: Element): Element[] {
  return [...listbox.querySelectorAll('[role="option"]')].filter(
    (o) => o.getAttribute('aria-disabled') !== 'true',
  );
}

/** Whether a combobox now shows `label` as (one of) its value(s). */
export function comboboxShows(combobox: Element, label: string): boolean {
  const wanted = normalizeLabel(label);
  if (wanted === '') return false;
  const shown = [shownValue(combobox)];
  // react-select renders the value beside the input, in its control container.
  // Not any wider: the field's own label must not count as its value.
  const control = combobox.closest('[class*="control"], [class*="Control"], .select-shell');
  if (control !== null) shown.push(readableText(control));
  const name = combobox.getAttribute('name');
  if (name !== null && name !== '') {
    for (const hidden of rootScope(combobox).querySelectorAll(
      `input[type="hidden"][name="${cssString(name)}"]`,
    )) {
      if (isInput(hidden)) shown.push(hidden.value);
    }
  }
  return shown.some((text) => {
    const have = normalizeLabel(text);
    // One-way: the search text typed into the box ("Toronto") is not the chosen option ("Toronto, ON, Canada").
    return have !== '' && have.includes(wanted);
  });
}

/** The text a combobox's control shows (not the search typed into it). */
export function comboboxDisplay(combobox: Element): string {
  const control = combobox.closest('[class*="control"], [class*="Control"], .select-shell');
  return normalizeLabel(
    control === null ? (isInput(combobox) ? '' : readableText(combobox)) : readableText(control),
  );
}

/**
 * Some pickers show a short form of the choice ("+1" for "Canada +1"). That
 * counts when the display changed during this pick and is part of the label.
 */
export function comboboxShowsShortForm(combobox: Element, label: string, before: string): boolean {
  const now = comboboxDisplay(combobox);
  return now !== '' && now !== before && normalizeLabel(label).includes(now);
}

function shownValue(combobox: Element): string {
  if (isInput(combobox)) return combobox.value;
  return readableText(combobox);
}

/** Frameworks re-render after an event; a controlled input can snap back a moment later. */
const SETTLE_MS = 60;

/** Reads the value back once the page has had a moment to react (and undo it). */
export async function readBack(stuck: () => boolean, detail: string): Promise<ActResult> {
  await delay(SETTLE_MS);
  return stuck() ? ok(undefined) : err({ reason: 'valueDidNotStick', detail });
}
