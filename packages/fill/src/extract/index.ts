import type { ExtractedField } from '../types';

/**
 * Generic extraction: every fillable control under `root` as
 * `{ id, label, section, control, options, required, maxLength }`
 * (research §6 step 2). Walks open shadow roots. Read-only: never writes to
 * the DOM.
 */
export function extractFields(_root: ParentNode): ExtractedField[] {
  throw new Error('not implemented');
}
