import { VOCAB } from '@employ-me/core';
import { countryByCode } from '../../../reference';
import { CheckboxField } from '../controls/CheckboxField';
import { SelectField } from '../controls/SelectField';
import { TextField } from '../controls/TextField';
import { YesNoField } from '../controls/YesNoField';
import { BLANK_SALARY, type PreferencesForm, type SalaryForm } from '../profile-form';
import { vocabLabel, vocabOptions } from '../vocab-labels';
import { fieldAt, type SectionProps } from './section-props';

const NOTICE_UNITS = vocabOptions('noticeUnit');
const PERIODS = vocabOptions('salaryPeriod');

/** Relocation, work model, start date, notice period, and salary per country in its currency. */
export function PreferencesSection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (patch: Partial<PreferencesForm>) => {
    onChange((f) => ({ ...f, preferences: { ...f.preferences, ...patch } }));
  };
  const setSalary = (country: string, patch: Partial<SalaryForm>) => {
    onChange((f) => ({
      ...f,
      salary: { ...f.salary, [country]: { ...(f.salary[country] ?? BLANK_SALARY), ...patch } },
    }));
  };
  const { preferences } = form;
  return (
    <section className="card" id="preferences" data-testid="section-preferences">
      <h2>Preferences and salary</h2>
      <div className="grid">
        <YesNoField
          label="Open to relocating?"
          {...at('preferences.relocation')}
          value={preferences.relocation}
          onChange={(v) => {
            set({ relocation: v });
          }}
        />
        <TextField
          label="Earliest start date"
          type="date"
          {...at('preferences.startDate')}
          value={preferences.startDate}
          onChange={(v) => {
            set({ startDate: v });
          }}
        />
        <TextField
          label="Notice period"
          type="number"
          {...at('preferences.noticePeriod.amount')}
          value={preferences.noticeAmount}
          onChange={(v) => {
            set({ noticeAmount: v });
          }}
        />
        <SelectField
          label="Notice period unit"
          {...at('preferences.noticePeriod.unit')}
          value={preferences.noticeUnit}
          options={NOTICE_UNITS}
          blank="Choose…"
          onChange={(v) => {
            set({ noticeUnit: v });
          }}
        />
        <div className="field wide">
          <span className="label">Work models you’d take</span>
          <div className="choices" data-testid="field-preferences.workModels">
            {VOCAB.workModel.map((model) => (
              <CheckboxField
                key={model}
                label={vocabLabel('workModel', model)}
                checked={preferences.workModels.includes(model)}
                onChange={(checked) => {
                  set({
                    workModels: checked
                      ? VOCAB.workModel.filter((m) => m === model || preferences.workModels.includes(m))
                      : preferences.workModels.filter((m) => m !== model),
                  });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <h3 className="small muted" style={{ marginTop: 20 }}>
        Salary expectations, per country in its currency
      </h3>
      {form.countries.length === 0 ? <p className="muted">Add the countries you apply in first.</p> : null}
      {form.countries.map((country) => {
        const salary = form.salary[country] ?? BLANK_SALARY;
        const currency = countryByCode(country)?.currency ?? '';
        const path = `preferences.salary.${country}`;
        return (
          <div key={country} className="subcard" data-testid={`salary-${country}`}>
            <div className="subcard-header">
              {countryByCode(country)?.name ?? country} <span className="badge">{currency}</span>
            </div>
            <div className="grid">
              <TextField
                label={`Minimum (${currency})`}
                type="number"
                {...at(`${path}.min`)}
                value={salary.min}
                onChange={(v) => {
                  setSalary(country, { min: v });
                }}
              />
              <TextField
                label={`Maximum (${currency}, optional)`}
                type="number"
                {...at(`${path}.max`)}
                value={salary.max}
                onChange={(v) => {
                  setSalary(country, { max: v });
                }}
              />
              <SelectField
                label="Per"
                {...at(`${path}.period`)}
                value={salary.period}
                options={PERIODS}
                onChange={(v) => {
                  setSalary(country, { period: v });
                }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
