import { useId } from 'react';
import { COUNTRY_OPTIONS, countryName } from '../country-options';

/** Picks several countries: chips for the chosen ones, a dropdown to add another. */
export function CountryPicker({
  label,
  path,
  value,
  onChange,
  error,
  hint,
}: {
  readonly label: string;
  readonly path: string;
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
  readonly error?: string | undefined;
  readonly hint?: string;
}) {
  const id = useId();
  const remaining = COUNTRY_OPTIONS.filter((option) => !value.includes(option.value));
  return (
    <div className="field wide" data-invalid={error !== undefined} data-path={path}>
      <span className="label" id={`${id}-label`}>
        {label}
      </span>
      <div className="row" role="group" aria-labelledby={`${id}-label`} data-testid={`field-${path}`}>
        {value.map((code) => (
          <span key={code} className="badge" data-testid={`chosen-${path}-${code}`}>
            {countryName(code)}{' '}
            <button
              type="button"
              className="link-button"
              aria-label={`Remove ${countryName(code)}`}
              onClick={() => {
                onChange(value.filter((c) => c !== code));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <select
          className="input"
          style={{ width: 'auto' }}
          aria-label={`Add to ${label}`}
          data-testid={`add-${path}`}
          value=""
          onChange={(event) => {
            const code = event.target.value;
            if (code !== '' && !value.includes(code)) onChange([...value, code]);
          }}
        >
          <option value="">Add a country…</option>
          {remaining.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error !== undefined ? (
        <span className="field-error">{error}</span>
      ) : hint === undefined ? null : (
        <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}
