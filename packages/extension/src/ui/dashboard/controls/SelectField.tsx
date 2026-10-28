import { Field, type FieldChrome } from './Field';

export interface Option<V extends string> {
  readonly value: V;
  readonly label: string;
}

/** A dropdown. `blank` adds a first option for "not answered". */
export function SelectField<V extends string>({
  value,
  onChange,
  options,
  blank,
  ...chrome
}: FieldChrome & {
  readonly value: V | '';
  readonly onChange: (value: V | '') => void;
  readonly options: readonly Option<V>[];
  readonly blank?: string;
}) {
  return (
    <Field {...chrome}>
      {(id, describedBy) => (
        <select
          id={id}
          value={value}
          aria-invalid={chrome.error !== undefined}
          aria-describedby={describedBy}
          data-testid={`field-${chrome.path}`}
          onChange={(event) => {
            const picked = options.find((option) => option.value === event.target.value);
            onChange(picked?.value ?? '');
          }}
        >
          {blank === undefined ? null : <option value="">{blank}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
