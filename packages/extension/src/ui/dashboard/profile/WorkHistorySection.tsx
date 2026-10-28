import { CheckboxField } from '../controls/CheckboxField';
import { TextAreaField } from '../controls/TextAreaField';
import { TextField } from '../controls/TextField';
import { blankWork, type WorkForm } from '../profile-form';
import { fieldAt, newEntryId, type SectionProps } from './section-props';

export function WorkHistorySection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (index: number, patch: Partial<WorkForm>) => {
    onChange((f) => ({
      ...f,
      workHistory: f.workHistory.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  };
  return (
    <section className="card" id="work-history" data-testid="section-workHistory">
      <h2>Work history</h2>
      <p className="card-intro">Most recent first. A Draft can mention anything here.</p>
      {prefilled.has('background.workHistory') ? (
        <p className="notice notice-warn">These came from your Resume. Check each one.</p>
      ) : null}
      {form.workHistory.map((entry, index) => {
        const path = `background.workHistory.${String(index)}`;
        return (
          <div key={entry.id} className="subcard" data-testid={`work-${String(index)}`}>
            <div className="subcard-header">
              <span>{entry.title || entry.employer ? `${entry.title} · ${entry.employer}` : 'New job'}</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  onChange((f) => ({ ...f, workHistory: f.workHistory.filter((_, i) => i !== index) }));
                }}
              >
                Remove
              </button>
            </div>
            <div className="grid">
              <TextField
                label="Employer"
                {...at(`${path}.employer`)}
                value={entry.employer}
                onChange={(v) => {
                  set(index, { employer: v });
                }}
              />
              <TextField
                label="Title"
                {...at(`${path}.title`)}
                value={entry.title}
                onChange={(v) => {
                  set(index, { title: v });
                }}
              />
              <TextField
                label="Location"
                {...at(`${path}.location`)}
                value={entry.location}
                onChange={(v) => {
                  set(index, { location: v });
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
              {entry.current ? null : (
                <TextField
                  label="End"
                  type="month"
                  {...at(`${path}.endDate`)}
                  value={entry.endDate}
                  onChange={(v) => {
                    set(index, { endDate: v });
                  }}
                />
              )}
              <div className="field">
                <span className="label">&nbsp;</span>
                <CheckboxField
                  label="I work here now"
                  checked={entry.current}
                  testId={`field-${path}.current`}
                  onChange={(v) => {
                    set(index, { current: v });
                  }}
                />
              </div>
              <TextAreaField
                label="What you did"
                wide
                {...at(`${path}.description`)}
                value={entry.description}
                onChange={(v) => {
                  set(index, { description: v });
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
          onChange((f) => ({ ...f, workHistory: [...f.workHistory, blankWork(id)] }));
        }}
      >
        Add a job
      </button>
    </section>
  );
}
