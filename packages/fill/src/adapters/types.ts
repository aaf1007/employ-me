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

/** What the form shows for a file field after an attach (research 2026-10-28 §7.1). */
export type ShownFile =
  | { readonly kind: 'uploading' }
  | { readonly kind: 'failed' }
  /** The form shows a file under this text (its name, sometimes with a size or a "Remove" label). */
  | { readonly kind: 'named'; readonly text: string }
  /** Nothing to go on: the form keeps the file somewhere it doesn't show. */
  | { readonly kind: 'unknown' };

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
  /**
   * Resolves once a step that renders in batches has all its fields (or after
   * a cap), before the Fill carries out the step's first plan. Read-only.
   */
  waitForStepReady(form: Element): Promise<void>;
  repeatingSections(form: Element): readonly RepeatingSection[];
  /** How radios and checkboxes are ticked on this ATS. */
  readonly checkStrategy: NonNullable<ActIntent['strategy']>;
  /** Suggestions under a typeahead box, for widgets the adapter marked `typeahead`. */
  typeaheadSuggestions(input: Element): readonly Element[];
  /**
   * Some lists here show only what you search for (Workday's prompts:
   * schools, skills; research §4). When the open list has no fit, act/ types
   * the answer and looks again. It never presses Enter, which some of them
   * need (act/events.ts): those end as "Couldn't fill" with that fix.
   */
  readonly typeToSearch: boolean;
  /** What a combobox shows as chosen outside its own text, e.g. Workday's selected-item pills. Read-only. */
  comboboxChoices(combobox: Element): readonly string[];
  /**
   * What the form shows for a file attached to this field: the input taking
   * the file isn't the upload. Read-only. `field.element` may have left the
   * page (Greenhouse swaps the input for its own widget).
   */
  shownFile(field: ExtractedField): ShownFile;
}
