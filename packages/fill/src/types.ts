import type { AtsId, FieldDescriptor, FieldType } from '@employ-me/core';

/**
 * How a field is driven. extract/ decides it from the DOM (adapters may
 * override it); act/ has one operation per widget.
 */
export type Widget =
  | 'text'
  | 'textarea'
  /** A native <select>. */
  | 'select'
  | 'selectMultiple'
  /** A react-select or ARIA combobox: open it, pick from `[role=option]`. */
  | 'combobox'
  | 'comboboxMultiple'
  /** A text box that searches as you type and offers matches below it (Lever's location). */
  | 'typeahead'
  | 'radios'
  | 'checkbox'
  | 'checkboxes'
  /** Answers drawn as buttons, e.g. Ashby's Yes/No. */
  | 'buttons'
  | 'file';

/** One choosable answer of a radio, checkbox or button group, or a native <select>. */
export interface Choice {
  readonly label: string;
  readonly element: Element;
  /** The option's own value attribute, for native selects. */
  readonly value?: string;
}

/** A field found on the page: the DOM-free descriptor plus what act/ needs to drive it. */
export interface ExtractedField extends FieldDescriptor {
  /** The control itself, or the group container for radio, checkbox and button groups. */
  readonly element: Element;
  readonly widget: Widget;
  /** Radio, checkbox and button options, and native <select> options. Empty for other widgets. */
  readonly choices: readonly Choice[];
  /** The control's `name`, for adapter maps. */
  readonly name?: string;
  /** The `autocomplete` token, for the taxonomy rules. */
  readonly autocomplete?: string;
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
