import type { FieldType, Result } from '@employ-me/core';
import type { Refusal } from './guard';

export type ActError =
  | Refusal
  | { readonly reason: 'valueDidNotStick'; readonly detail: string }
  | { readonly reason: 'optionNotFound'; readonly detail: string }
  /** The list shows options only once searched, and typing didn't search (Workday's Enter-only prompts). */
  | { readonly reason: 'searchShowedNothing'; readonly detail: string };

export type ActResult = Result<void, ActError>;

/** Which field an operation is for. Attestation and never-stored types are refused. */
export interface ActIntent {
  readonly fieldType: FieldType;
  /**
   * How to tick radios and checkboxes. `click` (the default) runs the
   * element's own activation, which React needs. `events` sets the state and
   * fires input/change only: Lever's hCaptcha watches scripted clicks on
   * these controls (research §2 "Script-driven clicks can trigger CAPTCHAs").
   */
  readonly strategy?: 'click' | 'events';
}

/** Chooses one of the labels a list is showing, or null when none fits. */
export type Pick = (labels: readonly string[]) => number | null;
