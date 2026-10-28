import type { AtsId, FieldDescriptor, FieldType } from '@employ-me/core';

/** A field found on the page: the DOM-free descriptor plus the element to act on. */
export interface ExtractedField extends FieldDescriptor {
  /** The control itself, or the group container for radio/checkbox groups. */
  readonly element: Element;
}

/** Where a classification came from, in cascade order (research §6 step 3). */
export type ClassificationSource = 'adapter' | 'autocomplete' | 'rules' | 'savedAnswer' | 'provider';

export interface Classification {
  readonly fieldType: FieldType;
  readonly source: ClassificationSource;
  /** Set when an exact Saved Answer match was found. */
  readonly savedAnswerId?: string;
}

export interface FillContext {
  readonly ats: AtsId;
  readonly url: URL;
}
