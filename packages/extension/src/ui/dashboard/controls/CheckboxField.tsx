import { useId } from 'react';

export function CheckboxField({
  label,
  checked,
  onChange,
  testId,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly testId?: string;
}) {
  const id = useId();
  return (
    <span className="check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}
