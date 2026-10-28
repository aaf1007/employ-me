import { Field, type FieldChrome } from './Field';

export function TextField({
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete = 'off',
  ...chrome
}: FieldChrome & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'email' | 'tel' | 'url' | 'number' | 'date' | 'month';
  readonly placeholder?: string;
  readonly autoComplete?: string;
}) {
  return (
    <Field {...chrome}>
      {(id, describedBy) => (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
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
