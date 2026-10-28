import { useId, type ReactNode } from 'react';

export interface FieldChrome {
  readonly label: string;
  /** The schema path this input edits: "identity.legalName.first". Keys errors and test ids. */
  readonly path: string;
  readonly error?: string | undefined;
  readonly hint?: string;
  /** Filled in from your Resume: shown highlighted until you've checked it. */
  readonly prefilled?: boolean;
  readonly wide?: boolean;
}

/** A label, the control, and its hint or error. `children` receives the control's id. */
export function Field({
  label,
  path,
  error,
  hint,
  prefilled = false,
  wide = false,
  children,
}: FieldChrome & { readonly children: (id: string, describedBy: string) => ReactNode }) {
  const id = useId();
  const describedBy = `${id}-help`;
  return (
    <div
      className={wide ? 'field wide' : 'field'}
      data-invalid={error !== undefined}
      data-prefilled={prefilled}
      data-path={path}
    >
      <label htmlFor={id}>{label}</label>
      {children(id, describedBy)}
      {error !== undefined ? (
        <span id={describedBy} className="field-error" data-testid={`error-${path}`}>
          {error}
        </span>
      ) : hint !== undefined || prefilled ? (
        <span id={describedBy} className="field-hint">
          {prefilled ? 'From your Resume. Check it.' : hint}
        </span>
      ) : null}
    </div>
  );
}
