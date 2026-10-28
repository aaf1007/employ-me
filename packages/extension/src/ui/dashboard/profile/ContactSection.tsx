import { SelectField } from '../controls/SelectField';
import { TextField } from '../controls/TextField';
import type { ContactForm } from '../profile-form';
import { vocabOptions } from '../vocab-labels';
import { fieldAt, type SectionProps } from './section-props';

const PHONE_TYPES = vocabOptions('phoneType');

export function ContactSection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (patch: Partial<ContactForm>) => {
    onChange((f) => ({ ...f, contact: { ...f.contact, ...patch } }));
  };
  const { contact } = form;
  return (
    <section className="card" id="contact" data-testid="section-contact">
      <h2>Contact</h2>
      <div className="grid">
        <TextField
          label="Email"
          type="email"
          {...at('contact.email')}
          value={contact.email}
          onChange={(v) => {
            set({ email: v });
          }}
        />
        <TextField
          label="Phone country code"
          placeholder="+1"
          {...at('contact.phone.countryCode')}
          value={contact.phoneCountryCode}
          onChange={(v) => {
            set({ phoneCountryCode: v });
          }}
        />
        <TextField
          label="Phone number"
          type="tel"
          {...at('contact.phone.number')}
          value={contact.phoneNumber}
          onChange={(v) => {
            set({ phoneNumber: v });
          }}
        />
        <SelectField
          label="Phone type"
          {...at('contact.phone.type')}
          value={contact.phoneType}
          options={PHONE_TYPES}
          blank="Choose…"
          onChange={(v) => {
            set({ phoneType: v });
          }}
        />
      </div>
    </section>
  );
}
