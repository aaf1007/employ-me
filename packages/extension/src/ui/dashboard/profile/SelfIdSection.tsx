import type { CaSelfId, UsSelfId, VocabId, VocabValue } from '@employ-me/core';
import { SelectField } from '../controls/SelectField';
import { vocabOptions } from '../vocab-labels';
import type { SectionProps } from './section-props';

interface Question<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly vocab: VocabId;
}

const US: readonly Question<keyof UsSelfId>[] = [
  { key: 'sex', label: 'Sex', vocab: 'usSex' },
  { key: 'hispanicLatino', label: 'Hispanic or Latino', vocab: 'usHispanicLatino' },
  { key: 'race', label: 'Race', vocab: 'usRace' },
  { key: 'veteran', label: 'Protected veteran status', vocab: 'usVeteran' },
  { key: 'disability', label: 'Disability', vocab: 'usDisability' },
];

const CA: readonly Question<keyof CaSelfId>[] = [
  { key: 'genderIdentity', label: 'Gender identity', vocab: 'caGenderIdentity' },
  { key: 'indigenous', label: 'Indigenous identity', vocab: 'caIndigenous' },
  { key: 'visibleMinority', label: 'Member of a visible minority', vocab: 'caVisibleMinority' },
  { key: 'disability', label: 'Person with a disability', vocab: 'caDisability' },
];

/**
 * Self-ID Answers per country. They never go to the AI, and a Fill uses only
 * what you choose here: each starts as "Decline to answer" (design.md
 * "Sensitive questions").
 */
export function SelfIdSection({ form, onChange }: SectionProps) {
  const showUs = form.countries.includes('US');
  const showCa = form.countries.includes('CA');
  return (
    <section className="card" id="self-id" data-testid="section-selfId">
      <h2>Self-ID Answers</h2>
      <p className="card-intro">
        Voluntary self-identification questions. Your answers stay on this computer and never go to the AI.
        Each one starts as “Decline to answer”, and a Fill only ever uses what you choose here.
      </p>
      {!showUs && !showCa ? (
        <p className="muted">
          Self-ID Answers are kept for the United States and Canada. Add one of them to the countries you
          apply in.
        </p>
      ) : null}
      {showUs ? (
        <div className="subcard" data-testid="self-id-US">
          <div className="subcard-header">United States</div>
          <div className="grid">
            {US.map((question) => (
              <SelectField
                key={question.key}
                label={question.label}
                path={`selfId.US.${question.key}`}
                value={form.selfId.US[question.key]}
                options={options(question.vocab)}
                onChange={(value) => {
                  if (value === '') return;
                  onChange((f) => ({
                    ...f,
                    selfId: { ...f.selfId, US: { ...f.selfId.US, [question.key]: value } },
                  }));
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
      {showCa ? (
        <div className="subcard" data-testid="self-id-CA">
          <div className="subcard-header">Canada</div>
          <div className="grid">
            {CA.map((question) => (
              <SelectField
                key={question.key}
                label={question.label}
                path={`selfId.CA.${question.key}`}
                value={form.selfId.CA[question.key]}
                options={options(question.vocab)}
                onChange={(value) => {
                  if (value === '') return;
                  onChange((f) => ({
                    ...f,
                    selfId: { ...f.selfId, CA: { ...f.selfId.CA, [question.key]: value } },
                  }));
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// The per-question vocabularies are a union here; the schema checks each value on save.
function options(vocab: VocabId): { value: VocabValue<VocabId>; label: string }[] {
  return vocabOptions(vocab);
}
