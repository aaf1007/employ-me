import { err } from '@employ-me/core';
import { readableText } from '../dom';
import { fireFocus, fireInput, fireKey, firePress, setNative, waitFor } from './events';
import { checkTarget } from './guard';
import { currentValue, readBack, valueMatches } from './read-back';
import type { ActIntent, ActResult, Pick } from './types';

export interface TypeaheadRequest {
  readonly search: string;
  readonly pick: Pick;
  /** Where the suggestions appear, e.g. ".dropdown-location" under Lever's location box. */
  readonly suggestions: (input: Element) => readonly Element[];
}

/**
 * A search-as-you-type box with plain-text suggestions (Lever's location):
 * type the text, nudge the page's keydown handler, pick a suggestion.
 */
export async function chooseTypeaheadOption(
  input: Element,
  request: TypeaheadRequest,
  intent: ActIntent,
): Promise<ActResult> {
  const refusal = checkTarget(input, 'text', intent.fieldType);
  if (refusal !== null) return err(refusal);
  fireFocus(input);
  setNative(input, 'value', request.search);
  fireInput(input, request.search.slice(-1));
  fireKey(input, 'keydown', request.search.slice(-1) || 'a');
  fireKey(input, 'keyup', request.search.slice(-1) || 'a');
  const suggestions = await waitFor(() => {
    const found = request.suggestions(input);
    return found.length > 0 ? found : null;
  }, 6000);
  if (suggestions === null) return err({ reason: 'optionNotFound', detail: 'no suggestions appeared' });
  const labels = suggestions.map((s) => readableText(s));
  const choice = request.pick(labels);
  const suggestion = choice === null ? undefined : suggestions[choice];
  if (suggestion === undefined || choice === null) {
    return err({ reason: 'optionNotFound', detail: `none of ${labels.length} suggestions matched` });
  }
  const optionRefusal = checkTarget(suggestion, 'typeaheadOption', intent.fieldType);
  if (optionRefusal !== null) return err(optionRefusal);
  firePress(suggestion);
  const label = labels[choice] ?? '';
  return readBack(
    () => valueMatches(currentValue(input), label, 'loose'),
    'the box did not keep the suggestion',
  );
}
