import { CountryPicker } from '../controls/CountryPicker';
import { SelectField } from '../controls/SelectField';
import { TextAreaField } from '../controls/TextAreaField';
import { TextField } from '../controls/TextField';
import { YesNoField } from '../controls/YesNoField';
import { countryName } from '../country-options';
import { BLANK_WORK_AUTHORIZATION, type WorkAuthorizationForm } from '../profile-form';
import { vocabOptions } from '../vocab-labels';
import { fieldAt, type SectionProps } from './section-props';

const SPONSORSHIP = vocabOptions('sponsorship');

/** Work Authorization for one country (glossary). */
export function WorkAuthorizationCard({
  country,
  form,
  errors,
  prefilled,
  onChange,
}: SectionProps & { readonly country: string }) {
  const at = fieldAt(errors, prefilled);
  const auth = form.workAuthorization[country] ?? BLANK_WORK_AUTHORIZATION;
  const set = (patch: Partial<WorkAuthorizationForm>) => {
    onChange((f) => ({
      ...f,
      workAuthorization: {
        ...f.workAuthorization,
        [country]: { ...(f.workAuthorization[country] ?? BLANK_WORK_AUTHORIZATION), ...patch },
      },
    }));
  };
  const path = `workAuthorization.${country}`;
  const name = countryName(country);
  return (
    <div className="subcard" data-testid={`work-authorization-${country}`}>
      <div className="subcard-header">{name}</div>
      <div className="grid">
        <YesNoField
          label={`Are you allowed to work in ${name} now?`}
          {...at(`${path}.authorizedNow`)}
          value={auth.authorizedNow}
          onChange={(v) => {
            set({ authorizedNow: v });
          }}
        />
        <SelectField
          label="Do you need sponsorship, now or later?"
          hint="“Ask me each time” sends this question to Needs your review on every form."
          {...at(`${path}.sponsorship`)}
          value={auth.sponsorship}
          options={SPONSORSHIP}
          blank="Choose…"
          onChange={(v) => {
            set({ sponsorship: v });
          }}
        />
        <TextField
          label="Your status"
          placeholder="Citizen, Permanent resident, TN…"
          {...at(`${path}.status`)}
          value={auth.status}
          onChange={(v) => {
            set({ status: v });
          }}
        />
        {country === 'US' ? (
          <YesNoField
            label="Are you a “U.S. person” (export control)?"
            hint="Citizens, permanent residents, refugees and asylees are."
            {...at(`${path}.usPerson`)}
            value={auth.usPerson}
            onChange={(v) => {
              set({ usPerson: v });
            }}
          />
        ) : null}
        <CountryPicker
          label="Citizenships"
          path={`${path}.citizenships`}
          error={errors[`${path}.citizenships`]}
          value={auth.citizenships}
          onChange={(v) => {
            set({ citizenships: v });
          }}
        />
        <TextAreaField
          label="Explanation (optional)"
          hint="Used when a form asks you to explain your situation."
          wide
          rows={3}
          {...at(`${path}.explanation`)}
          value={auth.explanation}
          onChange={(v) => {
            set({ explanation: v });
          }}
        />
      </div>
    </div>
  );
}
