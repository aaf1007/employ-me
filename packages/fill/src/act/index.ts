import { err, ok } from '@employ-me/core';
import { inputType, isInput, isSelect } from '../dom';
import { activate, fireBlur, fireChange, fireFocus, fireInput, firePress, setNative } from './events';
import { checkTarget, type ActOperation } from './guard';
import { currentValue, isChecked, isPressed, readBack, valueMatches, type TextCheck } from './read-back';
import type { ActIntent, ActResult } from './types';

// The ONLY module allowed to write to the DOM or dispatch events (ESLint
// enforces it everywhere else). Its API is a closed set of field operations.
// There is no generic click: nothing here can press Submit, Next, Apply or
// Send (see guard.ts). Every write is read back; a value the page didn't keep
// is `valueDidNotStick`, never success (CODING_STANDARDS.md "Fill outcomes").

export type { ActOperation, Refusal } from './guard';
export { checkTarget } from './guard';
export type { ActError, ActIntent, ActResult, Pick } from './types';
export type { TextCheck } from './read-back';
export { chooseComboboxOption, readComboboxOptions, type ComboboxRequest } from './combobox';
export { chooseTypeaheadOption, type TypeaheadRequest } from './typeahead';
export { comboboxShows, isChecked, isPressed, currentValue } from './read-back';
export { clearOutlines, outlineField, type OutlineTone } from './outline';

/** Types text into an input or textarea with the React-safe setter, then reads it back. */
export function setText(
  el: Element,
  value: string,
  intent: ActIntent,
  check: TextCheck = 'exact',
): Promise<ActResult> {
  return guarded(el, 'text', intent, async () => {
    if (valueMatches(currentValue(el), value, check)) return ok(undefined);
    fireFocus(el);
    setNative(el, 'value', value);
    fireInput(el, value.slice(-1));
    fireChange(el);
    fireBlur(el);
    return readBack(() => valueMatches(currentValue(el), value, check), 'the field did not keep the text');
  });
}

export function setChecked(el: Element, checked: boolean, intent: ActIntent): Promise<ActResult> {
  return guarded(el, 'check', intent, async () => {
    if (isChecked(el) === checked) return ok(undefined);
    if (intent.strategy === 'events' && isInput(el)) {
      setNative(el, 'checked', checked);
      fireInput(el);
      fireChange(el);
    } else {
      activate(el);
    }
    if (isChecked(el) !== checked && isInput(el)) {
      // Some widgets swallow the click; fall back to setting the state.
      setNative(el, 'checked', checked);
      fireInput(el);
      fireChange(el);
    }
    return readBack(() => isChecked(el) === checked, 'the box did not keep its state');
  });
}

/** Picks a native <select> option by its value attribute. */
export function selectNativeOption(
  select: Element,
  optionValue: string,
  intent: ActIntent,
): Promise<ActResult> {
  return guarded(select, 'nativeSelect', intent, async () => {
    if (isSelect(select) && select.value === optionValue) return ok(undefined);
    fireFocus(select);
    setNative(select, 'value', optionValue);
    fireInput(select);
    fireChange(select);
    fireBlur(select);
    return readBack(
      () => isSelect(select) && select.value === optionValue,
      'the list did not keep the choice',
    );
  });
}

/** Picks several options of a native <select multiple>. */
export function selectNativeOptions(
  select: Element,
  optionValues: readonly string[],
  intent: ActIntent,
): Promise<ActResult> {
  return guarded(select, 'nativeSelect', intent, async () => {
    if (!isSelect(select))
      return err({ reason: 'wrongElementKind', detail: 'nativeSelect needs a <select>' });
    for (const option of select.options) setNative(option, 'selected', optionValues.includes(option.value));
    fireInput(select);
    fireChange(select);
    const chosen = () => [...select.selectedOptions].map((o) => o.value);
    return readBack(
      () => optionValues.every((v) => chosen().includes(v)),
      'the list did not keep the choices',
    );
  });
}

/** Clicks one option of an open list (role=option or a native <option>). */
export function chooseOption(option: Element, intent: ActIntent): Promise<ActResult> {
  return guarded(option, 'chooseOption', intent, () => {
    firePress(option);
    return Promise.resolve(ok(undefined));
  });
}

/** Answers drawn as buttons, e.g. Ashby's Yes/No. */
export function chooseButtonOption(button: Element, intent: ActIntent): Promise<ActResult> {
  return guarded(button, 'choiceButton', intent, async () => {
    if (isPressed(button)) return ok(undefined);
    activate(button);
    return readBack(() => isPressed(button), 'the button did not stay selected');
  });
}

/**
 * Attaches a file through DataTransfer (research §5 "Resume files"), then
 * checks the input took it. Checked at once: sites often move the file into
 * their own state and swap or clear the input right after.
 */
export function attachFile(input: Element, file: File, intent: ActIntent): Promise<ActResult> {
  return guarded(input, 'file', intent, () => {
    if (!isInput(input) || inputType(input) !== 'file') {
      return Promise.resolve(err({ reason: 'wrongElementKind', detail: 'file needs a file input' }));
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    const took = input.files[0]?.name === file.name;
    fireInput(input);
    fireChange(input);
    return Promise.resolve(
      took ? ok(undefined) : err({ reason: 'valueDidNotStick', detail: 'the form did not take the file' }),
    );
  });
}

/** Presses an "Add another" section button (work history, education, links). */
export function pressAddAnother(button: Element): Promise<ActResult> {
  return guarded(button, 'addAnother', null, () => {
    activate(button);
    return Promise.resolve(ok(undefined));
  });
}

function guarded(
  el: Element,
  operation: ActOperation,
  intent: ActIntent | null,
  perform: () => Promise<ActResult>,
): Promise<ActResult> {
  const refusal = checkTarget(el, operation, intent?.fieldType ?? null);
  return refusal === null ? perform() : Promise.resolve(err(refusal));
}
