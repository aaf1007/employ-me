import type { FormErrors, ProfileForm } from '../profile-form';

/** Every Profile section edits a slice of one shared form. */
export interface SectionProps {
  readonly form: ProfileForm;
  readonly errors: FormErrors;
  /** Paths your Resume filled in (setup only). */
  readonly prefilled: ReadonlySet<string>;
  readonly onChange: (update: (form: ProfileForm) => ProfileForm) => void;
}

/** The path, error and highlight for one input. */
export function fieldAt(errors: FormErrors, prefilled: ReadonlySet<string>) {
  return (path: string) => ({ path, error: errors[path], prefilled: prefilled.has(path) });
}

/** A new id for a list entry. Call it from event handlers, not while rendering. */
export function newEntryId(): string {
  return crypto.randomUUID();
}
