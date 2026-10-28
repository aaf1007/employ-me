import { TextField } from '../controls/TextField';
import { YesNoField } from '../controls/YesNoField';
import type { IdentityForm } from '../profile-form';
import { fieldAt, type SectionProps } from './section-props';

export function IdentitySection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (patch: Partial<IdentityForm>) => {
    onChange((f) => ({ ...f, identity: { ...f.identity, ...patch } }));
  };
  const { identity } = form;
  return (
    <section className="card" id="identity" data-testid="section-identity">
      <h2>Identity</h2>
      <p className="card-intro">Your legal name, and the name you go by if it’s different.</p>
      <div className="grid">
        <TextField
          label="Legal first name"
          {...at('identity.legalName.first')}
          value={identity.legalFirst}
          onChange={(v) => {
            set({ legalFirst: v });
          }}
        />
        <TextField
          label="Legal middle name"
          {...at('identity.legalName.middle')}
          value={identity.legalMiddle}
          onChange={(v) => {
            set({ legalMiddle: v });
          }}
        />
        <TextField
          label="Legal last name"
          {...at('identity.legalName.last')}
          value={identity.legalLast}
          onChange={(v) => {
            set({ legalLast: v });
          }}
        />
        <TextField
          label="Preferred first name"
          hint="If it differs from your legal name."
          {...at('identity.preferredName.first')}
          value={identity.preferredFirst}
          onChange={(v) => {
            set({ preferredFirst: v });
          }}
        />
        <TextField
          label="Preferred last name"
          {...at('identity.preferredName.last')}
          value={identity.preferredLast}
          onChange={(v) => {
            set({ preferredLast: v });
          }}
        />
        <YesNoField
          label="Are you 18 or older?"
          {...at('identity.over18')}
          value={identity.over18}
          onChange={(v) => {
            set({ over18: v });
          }}
        />
      </div>
    </section>
  );
}
