import { err, ok } from '@employ-me/core';
import { isInput, readableText, rememberOptions } from '../dom';
import { delay, fireChange, fireFocus, fireInput, fireKey, firePress, setNative, waitFor } from './events';
import { checkTarget } from './guard';
import { comboboxDisplay, comboboxShows, comboboxShowsShortForm, listboxOf, optionsIn } from './read-back';
import type { ActIntent, ActResult, Pick } from './types';

// The combobox driver (research §5 "Dropdowns"): open, optionally type to
// filter, wait for [role=option], pick, then read the choice back.
// freehire's combobox.ts (MIT) was the reference for the event order.

const OPEN_TIMEOUT_MS = 1500;
const SEARCH_TIMEOUT_MS = 6000;

export interface ComboboxRequest {
  readonly pick: Pick;
  /** Typed into the box first, for long or remote lists (cities, schools). */
  readonly search?: string;
}

export async function chooseComboboxOption(
  combobox: Element,
  request: ComboboxRequest,
  intent: ActIntent,
): Promise<ActResult> {
  const refusal = checkTarget(combobox, 'openCombobox', intent.fieldType);
  if (refusal !== null) return err(refusal);

  const before = comboboxDisplay(combobox);
  const listbox = await openListbox(combobox, request.search);
  if (listbox === null) return err({ reason: 'optionNotFound', detail: 'the list did not open' });

  const options = await waitFor(
    () => {
      const found = optionsIn(listbox);
      return found.length > 0 && !isLoading(listbox) ? found : null;
    },
    request.search === undefined ? OPEN_TIMEOUT_MS : SEARCH_TIMEOUT_MS,
  );
  if (options === null) {
    close(combobox);
    return err({ reason: 'optionNotFound', detail: 'the list had no options' });
  }
  const labels = options.map((o) => readableText(o));
  if (request.search === undefined) rememberOptions(combobox, labels);
  const choice = request.pick(labels);
  const option = choice === null ? undefined : options[choice];
  if (option === undefined || choice === null) {
    close(combobox);
    return err({ reason: 'optionNotFound', detail: `none of ${labels.length} options matched` });
  }
  const optionRefusal = checkTarget(option, 'chooseOption', intent.fieldType);
  if (optionRefusal !== null) {
    close(combobox);
    return err(optionRefusal);
  }
  firePress(option);
  const label = labels[choice] ?? '';
  const shows = () =>
    comboboxShows(combobox, label) || comboboxShowsShortForm(combobox, label, before) ? true : null;
  let stuck = await waitFor(shows, 300);
  if (stuck === null && listboxOf(combobox) !== null) {
    // Some wrappers (Greenhouse's) commit the choice when the menu closes.
    close(combobox);
    stuck = await waitFor(shows, 1500);
  }
  if (listboxOf(combobox) !== null) close(combobox);
  if (stuck === null)
    return err({ reason: 'valueDidNotStick', detail: 'the list closed without showing the choice' });
  return ok(undefined);
}

/** Reads a combobox's options without choosing one: opens it, reads, closes. */
export async function readComboboxOptions(combobox: Element, intent: ActIntent): Promise<readonly string[]> {
  if (checkTarget(combobox, 'openCombobox', intent.fieldType) !== null) return [];
  const listbox = await openListbox(combobox, undefined);
  if (listbox === null) return [];
  const options = await waitFor(() => {
    const found = optionsIn(listbox);
    return found.length > 0 ? found : null;
  }, OPEN_TIMEOUT_MS);
  close(combobox);
  const labels = (options ?? []).map((o) => readableText(o));
  rememberOptions(combobox, labels);
  return labels;
}

async function openListbox(combobox: Element, search: string | undefined): Promise<Element | null> {
  fireFocus(combobox);
  const already = listboxOf(combobox);
  // The whole press: react-select opens on mousedown, but Greenhouse's
  // wrapper controls the menu and toggles it on mouseup.
  if (already === null || optionsIn(already).length === 0) firePress(combobox);
  if (search !== undefined && isInput(combobox)) {
    setNative(combobox, 'value', search);
    fireInput(combobox, search.slice(-1));
    fireChange(combobox);
  }
  let listbox = await waitFor(() => listboxOf(combobox), 400);
  if (listbox === null) {
    // Keyboard fallback: most comboboxes open on ArrowDown (Greenhouse on its keyup).
    fireKey(combobox, 'keydown', 'ArrowDown');
    fireKey(combobox, 'keyup', 'ArrowDown');
    listbox = await waitFor(() => listboxOf(combobox), OPEN_TIMEOUT_MS);
  }
  if (listbox === null && !isInput(combobox)) {
    // Buttons that open on click (Headless UI Listbox).
    firePress(combobox);
    listbox = await waitFor(() => listboxOf(combobox), OPEN_TIMEOUT_MS);
  }
  return listbox;
}

function isLoading(listbox: Element): boolean {
  const scope = listbox.parentElement ?? listbox;
  return scope.querySelector('[class*="loading"], [class*="Loading"], [aria-busy="true"]') !== null;
}

function close(combobox: Element): void {
  fireKey(combobox, 'keydown', 'Escape');
  fireKey(combobox, 'keyup', 'Escape');
}

export { delay };
