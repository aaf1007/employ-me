import { Field, type FieldChrome } from './Field';

export function TextAreaField({
  value,
  onChange,
  rows = 4,
  ...chrome
}: FieldChrome & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly rows?: number;
}) {
  return (
    <Field {...chrome}>
      {(id, describedBy) => (
        <textarea
          id={id}
          value={value}
          rows={rows}
          aria-invalid={chrome.error !== undefined}
          aria-describedby={describedBy}
          data-testid={`field-${chrome.path}`}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}
