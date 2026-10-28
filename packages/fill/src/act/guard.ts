import { sensitivityOf, type FieldType } from '@employ-me/core';

// Why this file exists: employ-me is an assistant, not a bot. It must be
// impossible to press a form's final Submit or a "Next" button through act/
// (design.md "What it is"; research §8 "Assistant vs. bot"). Every act/
// operation runs checkTarget first, and nothing outside act/ may write to the
// DOM (ESLint enforces that).
//
// The checks are deliberately conservative: refusing a harmless button costs
// a "Couldn't fill"; pressing Submit costs the user an application.

export type ActOperation =
  | 'text'
  | 'check'
  | 'nativeSelect'
  | 'openCombobox'
  | 'chooseOption'
  | 'choiceButton'
  | 'file'
  | 'addAnother'
  | 'typeaheadOption'
  /** The Fill's outline on a field: style only, never a value (outline.ts). */
  | 'outline';

export type Refusal =
  | { readonly reason: 'forbiddenControl'; readonly detail: string }
  | { readonly reason: 'sensitiveFieldType'; readonly detail: string }
  | { readonly reason: 'wrongElementKind'; readonly detail: string }
  | { readonly reason: 'disconnected'; readonly detail: string };

/**
 * Word stems that mark a control as moving, submitting, signing in or
 * destroying work. A stem matches at the start of a word with any ending, so
 * "submit" also catches "submitting" and "suivant" catches "Page suivante".
 * English plus French, because a missed French "Suivant" is worse than a
 * refused button. Checked against every name-like attribute, after
 * nameHaystack splits `btn_submit`, `nav-next`, `SUBMIT_BTN` and
 * `pageFooterNextButton` into words.
 */
const FORBIDDEN_STEMS = [
  // English
  'submi(t|ss)',
  'appl(y|ie)',
  'next',
  'continu',
  'proceed',
  'send',
  'finish',
  'review',
  'confirm',
  'done',
  'save',
  'sign ?(in|up|on)',
  'log ?(in|on)',
  'regist',
  'create (an? |your |new |my )?account',
  'auto ?fill',
  'cancel',
  'withdr[ae]w',
  'delet',
  'remov',
  'reset',
  // French
  'soum(et|is)',
  'postul',
  'candidat(er|ez)',
  'suivant',
  'envo[iy]',
  'termin',
  'valid',
  'proc[ée]d',
  'enregistr',
  'sauvegard',
  'connect',
  'connexion',
  's ?identifi',
  'inscri',
  'cr[ée]e[rz]? (un |mon |votre )?compte',
  'annul',
  'retir',
  'supprim',
  'effac',
  'r[ée]initialis',
];
const FORBIDDEN_WORDS = new RegExp(`\\b(${FORBIDDEN_STEMS.join('|')})\\w*`, 'i');

/** "Add another", "+ Add", "Add education", "Ajouter". */
const ADD_ANOTHER = /^\s*(\+\s*)?(add|ajouter)\b/i;

const CLICKABLE =
  'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"], input[type="image"], input[type="reset"], summary';

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'search', 'date', 'month']);

const NAME_ATTRIBUTES = [
  'aria-label',
  'title',
  'id',
  'class',
  'name',
  'value',
  'data-qa',
  'data-testid',
  'data-automation-id',
];

/** Decides whether `operation` may touch `el` for a field of `fieldType`. */
export function checkTarget(
  el: Element,
  operation: ActOperation,
  fieldType: FieldType | null,
): Refusal | null {
  if (!el.isConnected) return { reason: 'disconnected', detail: 'element is no longer in the page' };

  if (fieldType !== null) {
    const sensitivity = sensitivityOf(fieldType);
    if (sensitivity === 'attestation' || sensitivity === 'neverStored') {
      return { reason: 'sensitiveFieldType', detail: `${fieldType} is never filled automatically` };
    }
  }

  const forbidden = forbiddenControl(el);
  if (forbidden !== null) return { reason: 'forbiddenControl', detail: forbidden };

  return kindMismatch(el, operation);
}

function forbiddenControl(el: Element): string | null {
  const control = el.closest(CLICKABLE);
  if (control === null) return null;

  if (isInput(control) && ['submit', 'image', 'reset'].includes(control.type)) {
    return `input type=${control.type}`;
  }
  if (isButton(control) && control.type === 'submit' && control.form !== null) {
    return 'button submits its form';
  }
  const haystack = nameHaystack(control);
  const match = FORBIDDEN_WORDS.exec(haystack);
  return match === null ? null : `control is named "${match[0]}"`;
}

function kindMismatch(el: Element, operation: ActOperation): Refusal | null {
  const ok = (condition: boolean, expected: string): Refusal | null =>
    condition ? null : { reason: 'wrongElementKind', detail: `${operation} needs ${expected}` };
  const role = el.getAttribute('role');

  switch (operation) {
    case 'text':
      return ok(
        (isInput(el) && TEXT_INPUT_TYPES.has(el.type)) || el.localName === 'textarea',
        'a text input or textarea',
      );
    case 'check':
      return ok(
        (isInput(el) && (el.type === 'checkbox' || el.type === 'radio')) ||
          role === 'checkbox' ||
          role === 'radio' ||
          role === 'switch',
        'a checkbox, radio or switch',
      );
    case 'nativeSelect':
      return ok(el.localName === 'select', 'a <select>');
    case 'openCombobox':
      return ok(role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox', 'a combobox');
    case 'chooseOption':
      return ok(role === 'option' || el.localName === 'option', 'an option');
    case 'choiceButton':
      // Yes/No answers drawn as buttons (Ashby). Only reached if not forbidden above.
      return ok(el.closest(CLICKABLE) !== null, 'a button');
    case 'file':
      return ok(isInput(el) && el.type === 'file', 'a file input');
    case 'typeaheadOption':
      // A suggestion under a search-as-you-type box (Lever's location): plain
      // text in a dropdown, never a control of its own.
      return ok(
        el.closest(SUGGESTION_LIST) !== null && el.closest(CLICKABLE) === null && !isFormControl(el),
        'a suggestion in a dropdown list',
      );
    case 'outline':
      return null;
    case 'addAnother': {
      const control = el.closest(CLICKABLE);
      const name = control === null ? '' : primaryName(control);
      return ok(control !== null && ADD_ANOTHER.test(name), 'an "Add another" button');
    }
  }
}

const SUGGESTION_LIST =
  '[role="listbox"], [class*="dropdown"], [class*="suggest"], [class*="autocomplete"], [class*="results"], [class*="menu"]';

function isFormControl(el: Element): boolean {
  return ['input', 'select', 'textarea', 'button'].includes(el.localName);
}

/**
 * Every name the control goes by, split into words. `\b` treats `_` as part
 * of a word, so `btn_submit` and `SUBMIT_BTN` would hide "submit" without
 * this; camelCase and digits are split too ("pageFooterNextButton",
 * "step2Next"), and apostrophes ("S'inscrire").
 */
function nameHaystack(el: Element): string {
  const parts = [primaryName(el)];
  for (const attribute of NAME_ATTRIBUTES) parts.push(el.getAttribute(attribute) ?? '');
  return parts
    .join(' ')
    .replace(/[_\-'’]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ');
}

function primaryName(el: Element): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (text !== '') return text;
  }
  const label = el.getAttribute('aria-label');
  if (label !== null && label.trim() !== '') return label;
  if (isInput(el)) return el.value;
  return el.textContent;
}

// localName, not instanceof: elements from iframes and other realms have
// different constructors.
function isInput(el: Element): el is HTMLInputElement {
  return el.localName === 'input';
}

function isButton(el: Element): el is HTMLButtonElement {
  return el.localName === 'button';
}
