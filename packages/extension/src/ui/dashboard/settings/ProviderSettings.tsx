import { PROVIDER_IDS, type ProviderId } from '@employ-me/core';
import { useId, useState } from 'react';
import type { Settings } from '../../../storage';
import { useToast } from '../common/toast-context';
import { TextField } from '../controls/TextField';
import { useDataStore } from '../data/store-context';

const NAMES: Readonly<Record<ProviderId, string>> = { claude: 'Claude', codex: 'Codex' };
const ABOUT: Readonly<Record<ProviderId, string>> = {
  claude: 'Your own logged-in `claude` CLI. Uses your plan’s limits.',
  codex: 'Your own logged-in `codex` CLI. Uses your plan’s limits.',
};
const DEFAULT_MODEL: Readonly<Record<ProviderId, string>> = {
  claude: 'Default (Sonnet)',
  codex: 'Default',
};

/** Which Provider the helper runs, and which model (design.md "AI"). Mount with a `key` per load. */
export function ProviderSettings({ saved }: { readonly saved: Settings }) {
  const store = useDataStore();
  const toast = useToast();
  const id = useId();
  const [provider, setProvider] = useState<ProviderId>(saved.provider);
  const [models, setModels] = useState<Readonly<Record<ProviderId, string>>>({
    claude: saved.models.claude ?? '',
    codex: saved.models.codex ?? '',
  });
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const dirty =
    provider !== saved.provider ||
    models.claude !== (saved.models.claude ?? '') ||
    models.codex !== (saved.models.codex ?? '');

  const save = async () => {
    const claude = models.claude.trim();
    const codex = models.codex.trim();
    const result = await store.saveSettings({
      ...saved,
      provider,
      models: { ...(claude === '' ? {} : { claude }), ...(codex === '' ? {} : { codex }) },
    });
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.issues ?? []).map((issue) => [issue.path, issue.message])));
      return;
    }
    setErrors({});
    toast(`${NAMES[provider]} will be used for Drafts, field matching and reading Resumes.`);
  };

  return (
    <section className="card stack" style={{ gap: 14 }} data-testid="provider-settings">
      <div>
        <h2>Provider</h2>
        <p className="card-intro">
          The AI subscription you bring. It only ever sees field labels, options and the facts a Draft needs:
          never your Self-ID Answers.
        </p>
      </div>
      <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
        <legend className="label" style={{ fontWeight: 500, marginBottom: 6 }}>
          Use
        </legend>
        {PROVIDER_IDS.map((option) => (
          <label key={option} className="check" htmlFor={`${id}-${option}`}>
            <input
              id={`${id}-${option}`}
              type="radio"
              name={`${id}-provider`}
              checked={provider === option}
              onChange={() => {
                setProvider(option);
              }}
            />
            <span>
              <strong>{NAMES[option]}</strong>{' '}
              <span className="muted small">{ABOUT[option].replaceAll('`', '')}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid">
        {PROVIDER_IDS.map((option) => (
          <TextField
            key={option}
            label={`${NAMES[option]} model`}
            placeholder={DEFAULT_MODEL[option]}
            hint={
              option === 'claude'
                ? 'For example sonnet, opus or haiku. Empty uses Sonnet.'
                : 'Empty uses the CLI’s default.'
            }
            path={`models.${option}`}
            error={errors[`models.${option}`]}
            value={models[option]}
            onChange={(value) => {
              setModels({ ...models, [option]: value });
            }}
          />
        ))}
      </div>
      <div className="row">
        <span className="spacer" />
        <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => void save()}>
          Save
        </button>
      </div>
    </section>
  );
}
