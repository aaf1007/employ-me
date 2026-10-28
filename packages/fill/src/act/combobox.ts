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
/** How long a list that lists only what you search for gets to show results after typing. */
const TYPED_SEARCH_TIMEOUT_MS = 3000;

export interface ComboboxRequest {
  readonly pick: Pick;
  /** Typed into the box first, for long or remote lists (cities, schools). */
  readonly search?: string;
  /**
   * Typed only when the open list has nothing that fits, for lists that show
   * only what you search for (Workday's schools and skills).
   */
  readonly searchIfNeeded?: string;
  /** Where else the ATS shows the choice (Workday's selected-item pills). Read-only. */
  readonly shown?: (combobox: Element) => readonly string[];
}

export async function chooseComboboxOption(
  combobox: Element,
  request: ComboboxRequest,
  intent: ActIntent,
): Promise<ActResult> {
  const refusal = checkTarget(combobox, 'openCombobox', intent.fieldType);
  if (refusal !== null) return err(refusal);

  const retry =
    isInput(combobox) && request.searchIfNeeded !== request.search ? request.searchIfNeeded : undefined;
  const before = comboboxDisplay(combobox);
  let listbox = await openListbox(combobox, request.search, retry !== undefined);
  let options = listbox === null ? null : await listedOptions(listbox, request.search !== undefined);
  let labels = (options ?? []).map((o) => readableText(o));
  if (options !== null && request.search === undefined) rememberOptions(combobox, labels);
  let choice = options === null ? null : request.pick(labels);

  // Only a list that showed nothing until searched (searchIfNeeded) can end here: its search needs Enter.
  let searched = false;
  if (choice === null && retry !== undefined) {
    typeSearch(combobox, retry);
    searched = true;
    listbox = await waitFor(() => listboxOf(combobox), TYPED_SEARCH_TIMEOUT_MS);
    options = listbox === null ? null : await listedOptions(listbox, true);
    labels = (options ?? []).map((o) => readableText(o));
    choice = options === null ? null : request.pick(labels);
  }
  if ((listbox === null || options === null) && searched) {
    close(combobox);
    return err({ reason: 'searchShowedNothing', detail: 'typing a search listed nothing' });
  }
  if (listbox === null) return err({ reason: 'optionNotFound', detail: 'the list did not open' });
  if (options === null) {
    close(combobox);
    return err({ reason: 'optionNotFound', detail: 'the list had no options' });
  }
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
    comboboxShows(combobox, label, request.shown?.(combobox)) ||
    comboboxShowsShortForm(combobox, label, before)
      ? true
      : null;
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
  const listbox = await openListbox(combobox, undefined, false);
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

/** The options a list shows once it has finished loading, or null if it shows none in time. */
function listedOptions(listbox: Element, searched: boolean): Promise<Element[] | null> {
  return waitFor(
    () => {
      const found = optionsIn(listbox);
      return found.length > 0 && !isLoading(listbox) ? found : null;
    },
    searched ? SEARCH_TIMEOUT_MS : OPEN_TIMEOUT_MS,
  );
}

/**
 * Opens the list. `searchFollows` means an empty list is no failure yet: the
 * caller will search, so the slow keyboard fallbacks are skipped.
 */
async function openListbox(
  combobox: Element,
  search: string | undefined,
  searchFollows: boolean,
): Promise<Element | null> {
  fireFocus(combobox);
  const already = listboxOf(combobox);
  // The whole press: react-select opens on mousedown, but Greenhouse's
  // wrapper controls the menu and toggles it on mouseup.
  if (already === null || optionsIn(already).length === 0) firePress(combobox);
  if (search !== undefined && isInput(combobox)) typeSearch(combobox, search);
  let listbox = await waitFor(() => listboxOf(combobox), 400);
  if (listbox === null && searchFollows) return null;
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

/** Types into the search box. Never Enter: it can submit the form (events.ts). */
function typeSearch(combobox: Element, text: string): void {
  setNative(combobox, 'value', text);
  fireInput(combobox, text.slice(-1));
  fireChange(combobox);
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
