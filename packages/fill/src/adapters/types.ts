import type { AtsId, FieldType, PostingKey } from '@employ-me/core';
import type { ExtractedField } from '../types';

/**
 * Per-ATS knowledge. Every adapter ships with saved real forms in
 * fixtures/<ats>/ and e2e tests over them (CODING_STANDARDS.md "Adapters").
 * Adapters read the DOM; they never write it (that is act/'s job).
 */
export interface AtsAdapter {
  readonly ats: AtsId;
  /** The Application Form's root in this document, or null if there isn't one. */
  findForm(doc: Document): Element | null;
  extract(form: Element): ExtractedField[];
  /** The adapter map: first step of the classification cascade. Null when it doesn't know. */
  classify(field: ExtractedField): FieldType | null;
  postingKey(url: URL): PostingKey | null;
}
