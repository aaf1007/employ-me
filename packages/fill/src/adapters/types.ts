import type { AtsId, FieldType, PostingKey } from '@employ-me/core';
import type { ActIntent } from '../act';
import type { ExtractedField } from '../types';

/** A repeating section ("Education", "Employment") and its "Add another" button. */
export interface RepeatingSection {
  readonly section: 'education' | 'work';
  /** Entries the form shows now. */
  readonly entries: number;
  readonly addButton: Element | null;
}

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
  /** The ATS parses an attached Resume and overwrites fields with what it read (Lever). */
  readonly parsesResume: boolean;
  /** Resolves once the ATS has finished reading the Resume (or after a timeout). Read-only. */
  waitForResumeParse(form: Element): Promise<void>;
  repeatingSections(form: Element): readonly RepeatingSection[];
  /** How radios and checkboxes are ticked on this ATS. */
  readonly checkStrategy: NonNullable<ActIntent['strategy']>;
  /** Suggestions under a typeahead box, for widgets the adapter marked `typeahead`. */
  typeaheadSuggestions(input: Element): readonly Element[];
}
