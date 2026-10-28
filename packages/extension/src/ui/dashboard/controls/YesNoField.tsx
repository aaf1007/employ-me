import type { Tri } from '../profile-form';
import type { FieldChrome } from './Field';
import { SelectField } from './SelectField';

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

/** A yes/no question you can leave unanswered: a Fill then reports it as "not in your Profile". */
export function YesNoField({
  value,
  onChange,
  ...chrome
}: FieldChrome & { readonly value: Tri; readonly onChange: (value: Tri) => void }) {
  return <SelectField {...chrome} value={value} onChange={onChange} options={YES_NO} blank="Not answered" />;
}
