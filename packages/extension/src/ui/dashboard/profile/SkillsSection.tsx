import { SelectField } from '../controls/SelectField';
import { TextField } from '../controls/TextField';
import type { LanguageForm, SkillForm } from '../profile-form';
import { vocabOptions } from '../vocab-labels';
import { fieldAt, type SectionProps } from './section-props';

const PROFICIENCY = vocabOptions('languageProficiency');

/** Skills and languages: short lists, edited row by row. */
export function SkillsSection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const setSkill = (index: number, patch: Partial<SkillForm>) => {
    onChange((f) => ({ ...f, skills: f.skills.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  };
  const setLanguage = (index: number, patch: Partial<LanguageForm>) => {
    onChange((f) => ({ ...f, languages: f.languages.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  };
  return (
    <section className="card" id="skills" data-testid="section-skills">
      <h2>Skills and languages</h2>
      {prefilled.has('background.skills') || prefilled.has('background.languages') ? (
        <p className="notice notice-warn">These came from your Resume. Check them.</p>
      ) : null}
      <h3 className="small muted">Skills</h3>
      <div className="stack" style={{ gap: 8 }}>
        {form.skills.map((skill, index) => (
          <div key={index} className="grid" data-testid={`skill-${String(index)}`}>
            <TextField
              label="Skill"
              {...at(`background.skills.${String(index)}.name`)}
              value={skill.name}
              onChange={(v) => {
                setSkill(index, { name: v });
              }}
            />
            <TextField
              label="Other spellings"
              placeholder="JS, ECMAScript"
              hint="Comma-separated."
              {...at(`background.skills.${String(index)}.aliases`)}
              value={skill.aliases}
              onChange={(v) => {
                setSkill(index, { aliases: v });
              }}
            />
            <div className="field">
              <span className="label">&nbsp;</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  onChange((f) => ({ ...f, skills: f.skills.filter((_, i) => i !== index) }));
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        onClick={() => {
          onChange((f) => ({ ...f, skills: [...f.skills, { name: '', aliases: '' }] }));
        }}
      >
        Add a skill
      </button>

      <h3 className="small muted" style={{ marginTop: 20 }}>
        Languages
      </h3>
      <div className="stack" style={{ gap: 8 }}>
        {form.languages.map((language, index) => (
          <div key={index} className="grid" data-testid={`language-${String(index)}`}>
            <TextField
              label="Language"
              {...at(`background.languages.${String(index)}.language`)}
              value={language.language}
              onChange={(v) => {
                setLanguage(index, { language: v });
              }}
            />
            <SelectField
              label="Proficiency"
              {...at(`background.languages.${String(index)}.proficiency`)}
              value={language.proficiency}
              options={PROFICIENCY}
              blank="Choose…"
              onChange={(v) => {
                setLanguage(index, { proficiency: v });
              }}
            />
            <div className="field">
              <span className="label">&nbsp;</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  onChange((f) => ({ ...f, languages: f.languages.filter((_, i) => i !== index) }));
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        onClick={() => {
          onChange((f) => ({ ...f, languages: [...f.languages, { language: '', proficiency: '' }] }));
        }}
      >
        Add a language
      </button>
    </section>
  );
}
