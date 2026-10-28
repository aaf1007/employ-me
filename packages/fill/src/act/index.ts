import { err, type FieldType, type Result } from '@employ-me/core';
import { checkTarget, type ActOperation, type Refusal } from './guard';

// The ONLY module allowed to write to the DOM or dispatch events (ESLint
// enforces it everywhere else). Its API is a closed set of field operations.
// There is no generic click: nothing here can press Submit, Next, Apply or
// Send (see guard.ts).
//
// Techniques to use when implementing (research §5): prototype value setter,
// then input/change (bubbles, composed) and focusout, then read back;
// pointerdown → mousedown → mouseup → click to open comboboxes; DataTransfer
// for files.

export type { ActOperation, Refusal } from './guard';
export { checkTarget } from './guard';

export type ActError =
  | Refusal
  | { readonly reason: 'valueDidNotStick'; readonly detail: string }
  | { readonly reason: 'optionNotFound'; readonly detail: string };

export type ActResult = Result<void, ActError>;

/** Which field an operation is for. Attestation and never-stored types are refused. */
export interface ActIntent {
  readonly fieldType: FieldType;
}

export function setText(el: Element, _value: string, intent: ActIntent): ActResult {
  return guarded(el, 'text', intent, () => {
    throw new Error('not implemented');
  });
}

export function setChecked(el: Element, _checked: boolean, intent: ActIntent): ActResult {
  return guarded(el, 'check', intent, () => {
    throw new Error('not implemented');
  });
}

export function selectNativeOption(select: Element, _optionValue: string, intent: ActIntent): ActResult {
  return guarded(select, 'nativeSelect', intent, () => {
    throw new Error('not implemented');
  });
}

export function openCombobox(el: Element, intent: ActIntent): ActResult {
  return guarded(el, 'openCombobox', intent, () => {
    throw new Error('not implemented');
  });
}

export function chooseOption(option: Element, intent: ActIntent): ActResult {
  return guarded(option, 'chooseOption', intent, () => {
    throw new Error('not implemented');
  });
}

/** Answers drawn as buttons, e.g. Ashby's Yes/No. */
export function chooseButtonOption(button: Element, intent: ActIntent): ActResult {
  return guarded(button, 'choiceButton', intent, () => {
    throw new Error('not implemented');
  });
}

export function attachFile(input: Element, _file: File, intent: ActIntent): ActResult {
  return guarded(input, 'file', intent, () => {
    throw new Error('not implemented');
  });
}

/** Presses an "Add another" section button (work history, education, links). */
export function pressAddAnother(button: Element): ActResult {
  return guarded(button, 'addAnother', null, () => {
    throw new Error('not implemented');
  });
}

function guarded(
  el: Element,
  operation: ActOperation,
  intent: ActIntent | null,
  perform: () => ActResult,
): ActResult {
  const refusal = checkTarget(el, operation, intent?.fieldType ?? null);
  return refusal === null ? perform() : err(refusal);
}
