import { SelectField } from '../controls/SelectField';
import { TextField } from '../controls/TextField';
import { blankEducation, type EducationForm } from '../profile-form';
import { vocabOptions } from '../vocab-labels';
import { fieldAt, newEntryId, type SectionProps } from './section-props';

const DEGREE_LEVELS = vocabOptions('degreeLevel');

export function EducationSection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (index: number, patch: Partial<EducationForm>) => {
    onChange((f) => ({
      ...f,
      education: f.education.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  };
  return (
    <section className="card" id="education" data-testid="section-education">
      <h2>Education</h2>
      {prefilled.has('background.education') ? (
        <p className="notice notice-warn">These came from your Resume. Check each one.</p>
      ) : null}
      {form.education.map((entry, index) => {
        const path = `background.education.${String(index)}`;
        return (
          <div key={entry.id} className="subcard" data-testid={`education-${String(index)}`}>
            <div className="subcard-header">
              <span>{entry.school || 'New school'}</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  onChange((f) => ({ ...f, education: f.education.filter((_, i) => i !== index) }));
                }}
              >
                Remove
              </button>
            </div>
            <div className="grid">
              <TextField
                label="School"
                {...at(`${path}.school`)}
                value={entry.school}
                onChange={(v) => {
                  set(index, { school: v });
                }}
              />
              <TextField
                label="Degree, as written"
                placeholder="B.Sc."
                {...at(`${path}.degree`)}
                value={entry.degree}
                onChange={(v) => {
                  set(index, { degree: v });
                }}
              />
              <SelectField
                label="Degree level"
                {...at(`${path}.degreeLevel`)}
                value={entry.degreeLevel}
                options={DEGREE_LEVELS}
                blank="Choose…"
                onChange={(v) => {
                  set(index, { degreeLevel: v });
                }}
              />
              <TextField
                label="Field of study"
                {...at(`${path}.discipline`)}
                value={entry.discipline}
                onChange={(v) => {
                  set(index, { discipline: v });
                }}
              />
              <TextField
                label="Start"
                type="month"
                {...at(`${path}.startDate`)}
                value={entry.startDate}
                onChange={(v) => {
                  set(index, { startDate: v });
                }}
              />
              <TextField
                label="Graduation (or expected)"
                type="month"
                {...at(`${path}.endDate`)}
                value={entry.endDate}
                onChange={(v) => {
                  set(index, { endDate: v });
                }}
              />
              <TextField
                label="GPA (optional)"
                type="number"
                {...at(`${path}.gpa.value`)}
                value={entry.gpaValue}
                onChange={(v) => {
                  set(index, { gpaValue: v });
                }}
              />
              <TextField
                label="GPA out of"
                type="number"
                placeholder="4.0"
                {...at(`${path}.gpa.scale`)}
                value={entry.gpaScale}
                onChange={(v) => {
                  set(index, { gpaScale: v });
                }}
              />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn"
        style={{ marginTop: 12 }}
        onClick={() => {
          const id = newEntryId();
          onChange((f) => ({ ...f, education: [...f.education, blankEducation(id)] }));
        }}
      >
        Add a school
      </button>
    </section>
  );
}
