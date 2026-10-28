import type { SavedAnswer } from '@employ-me/core';
import type { Classification, ExtractedField, FillContext } from '../types';

export interface ClassifyContext extends FillContext {
  readonly savedAnswers: readonly SavedAnswer[];
}

/**
 * Fixed rules, in order: adapter map, then `autocomplete` tokens, regexes and
 * synonyms, then exact Saved Answer match (research §6 step 3). Returns
 * `unknown` when nothing matches; those fields may go to the Provider via
 * core's `toProviderField`. English only (design.md "Tech").
 */
export function classifyField(_field: ExtractedField, _context: ClassifyContext): Classification {
  throw new Error('not implemented');
}
