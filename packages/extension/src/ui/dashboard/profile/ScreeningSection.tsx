import { SelectField } from '../controls/SelectField';
import { TextField } from '../controls/TextField';
import { YesNoField } from '../controls/YesNoField';
import type { ScreeningForm, WorkedHereForm } from '../profile-form';
import { fieldAt, type SectionProps } from './section-props';

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

/** Common screening answers. Facts and willingness, not Attestations (glossary). */
export function ScreeningSection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (patch: Partial<ScreeningForm>) => {
    onChange((f) => ({ ...f, screening: { ...f.screening, ...patch } }));
  };
  const setRow = (index: number, patch: Partial<WorkedHereForm>) => {
    set({
      workedHereBefore: form.screening.workedHereBefore.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  };
  const { screening } = form;
  return (
    <section className="card" id="screening" data-testid="section-screening">
      <h2>Screening answers</h2>
      <p className="card-intro">
        Your usual answers to the questions most forms ask. A Fill uses them as they are.
      </p>
      <div className="grid">
        <TextField
          label="How you usually heard about the job"
          placeholder="LinkedIn, company website…"
          {...at('screening.howHeard')}
          value={screening.howHeard}
          onChange={(v) => {
            set({ howHeard: v });
          }}
        />
        <YesNoField
          label="Were you referred?"
          hint="Usually no; change it on the form when you were."
          {...at('screening.referred')}
          value={screening.referred}
          onChange={(v) => {
            set({ referred: v });
          }}
        />
        <YesNoField
          label="Willing to do a background check?"
          {...at('screening.backgroundCheck')}
          value={screening.backgroundCheck}
          onChange={(v) => {
            set({ backgroundCheck: v });
          }}
        />
        <YesNoField
          label="Bound by a non-compete?"
          {...at('screening.nonCompete')}
          value={screening.nonCompete}
          onChange={(v) => {
            set({ nonCompete: v });
          }}
        />
      </div>
      <h3 className="small muted" style={{ marginTop: 20 }}>
        Have you worked here before? (per company)
      </h3>
      <p className="muted small">
        A company that isn’t listed is asked, never guessed. Use the company’s name as it appears in its job
        links.
      </p>
      {screening.workedHereBefore.map((row, index) => (
        <div key={index} className="grid" data-testid={`worked-here-${String(index)}`}>
          <TextField
            label="Company"
            placeholder="acme"
            {...at(`screening.workedHereBefore.${String(index)}`)}
            value={row.employer}
            onChange={(v) => {
              setRow(index, { employer: v });
            }}
          />
          <SelectField
            label="Worked there before?"
            path={`screening.workedHereBefore.${String(index)}.value`}
            value={row.workedHere}
            options={YES_NO}
            onChange={(v) => {
              setRow(index, { workedHere: v === '' ? 'no' : v });
            }}
          />
          <div className="field">
            <span className="label">&nbsp;</span>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => {
                set({ workedHereBefore: screening.workedHereBefore.filter((_, i) => i !== index) });
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        onClick={() => {
          set({ workedHereBefore: [...screening.workedHereBefore, { employer: '', workedHere: 'yes' }] });
        }}
      >
        Add a company
      </button>
    </section>
  );
}
