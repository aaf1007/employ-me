import { SelectField } from '../controls/SelectField';
import { COUNTRY_OPTIONS } from '../country-options';
import { TextField } from '../controls/TextField';
import type { AddressForm } from '../profile-form';
import { fieldAt, type SectionProps } from './section-props';

export function AddressSection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (patch: Partial<AddressForm>) => {
    onChange((f) => ({ ...f, address: { ...f.address, ...patch } }));
  };
  const { address } = form;
  return (
    <section className="card" id="address" data-testid="section-address">
      <h2>Address</h2>
      <p className="card-intro">One address. Leave all of it empty if you’d rather not keep one.</p>
      <div className="grid">
        <TextField
          label="Street address"
          wide
          {...at('address.line1')}
          value={address.line1}
          onChange={(v) => {
            set({ line1: v });
          }}
        />
        <TextField
          label="Apartment, suite (optional)"
          {...at('address.line2')}
          value={address.line2}
          onChange={(v) => {
            set({ line2: v });
          }}
        />
        <TextField
          label="City"
          {...at('address.city')}
          value={address.city}
          onChange={(v) => {
            set({ city: v });
          }}
        />
        <TextField
          label="State, province or territory"
          {...at('address.region')}
          value={address.region}
          onChange={(v) => {
            set({ region: v });
          }}
        />
        <TextField
          label="Postal or ZIP code"
          {...at('address.postalCode')}
          value={address.postalCode}
          onChange={(v) => {
            set({ postalCode: v });
          }}
        />
        <SelectField
          label="Country"
          {...at('address.country')}
          value={address.country}
          options={COUNTRY_OPTIONS}
          blank="Choose a country"
          onChange={(v) => {
            set({ country: v });
          }}
        />
      </div>
    </section>
  );
}
