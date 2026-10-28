import type { ResumeExtract } from '@employ-me/core';
import { useState } from 'react';
import type { DataStore, ProfileFields, Topic } from '../../../storage';
import { ErrorNotice, type ShownError } from '../common/ErrorNotice';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';
import { useStoreQuery } from '../data/use-store-query';
import { CountriesSection } from '../profile/CountriesSection';
import { focusFirstInvalid } from '../profile/focus';
import { PreferencesSection } from '../profile/PreferencesSection';
import { ScreeningSection } from '../profile/ScreeningSection';
import { newEntryId, type SectionProps } from '../profile/section-props';
import { SelfIdSection } from '../profile/SelfIdSection';
import { applyExtract, toForm, validateForm } from '../profile-form';
import { DoneStep } from './DoneStep';
import { ResumeStep } from './ResumeStep';
import { ReviewStep } from './ReviewStep';
import { Stepper } from './Stepper';
import { stepAfter, stepBefore, stepErrors, type StepId } from './steps';

const SETTINGS: readonly Topic[] = ['settings'];
const loadSettings = (store: DataStore) => store.getSettings();
const PROVIDER_NAMES = { claude: 'Claude', codex: 'Codex' } as const;

/**
 * The setup questionnaire. Each step saves the whole Profile before moving
 * on, so a setup you leave half-done is kept; the Profile's sections are all
 * optional (BUILD_LOG, foundation entry).
 */
export function SetupFlow({ initial }: { readonly initial: ProfileFields }) {
  const store = useDataStore();
  const toast = useToast();
  const settings = useStoreQuery(SETTINGS, loadSettings);
  const [step, setStep] = useState<StepId>('resume');
  const [form, setForm] = useState(() => toForm(initial));
  const [prefilled, setPrefilled] = useState<ReadonlySet<string>>(() => new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [failure, setFailure] = useState<ShownError | null>(null);
  const [saving, setSaving] = useState(false);

  const provider = settings.result?.ok === true ? settings.result.value.provider : 'claude';
  const errors = step !== 'resume' && step !== 'done' && showErrors ? stepErrors(step, form) : {};
  const sectionProps: SectionProps = { form, errors, prefilled, onChange: setForm };

  const go = (to: StepId) => {
    setStep(to);
    setShowErrors(false);
    setFailure(null);
    window.scrollTo({ top: 0 });
  };

  const onRead = (extract: ResumeExtract) => {
    const filled = applyExtract(form, extract, newEntryId);
    setForm(filled.form);
    setPrefilled(new Set(filled.paths));
    toast(
      filled.paths.length === 0
        ? 'Nothing new was found in your Resume.'
        : 'Your Resume was read. Check each field.',
    );
    go('review');
  };

  const next = async () => {
    if (step === 'resume' || step === 'done') return;
    if (Object.keys(stepErrors(step, form)).length > 0) {
      setShowErrors(true);
      focusFirstInvalid();
      return;
    }
    const validation = validateForm(form);
    if (!validation.ok) {
      setFailure({
        reason: 'invalidInput',
        message: 'Some answers in an earlier step need fixing.',
        fix: 'Go back, check the highlighted fields, then continue.',
      });
      return;
    }
    setSaving(true);
    const saved = await store.saveProfileFields(validation.fields);
    if (saved.ok && step === 'selfId') {
      const current = await store.getSettings();
      if (current.ok)
        await store.saveSettings({ ...current.value, setupCompletedAt: new Date().toISOString() });
    }
    setSaving(false);
    if (!saved.ok) {
      setFailure(saved.error);
      return;
    }
    go(stepAfter(step));
  };

  return (
    <div className="stack" data-testid="setup" data-step={step}>
      <Stepper current={step} />
      {failure === null ? null : <ErrorNotice error={failure} title="This step wasn’t saved." />}

      {step === 'resume' ? (
        <ResumeStep
          providerName={PROVIDER_NAMES[provider]}
          onRead={onRead}
          onSkip={() => {
            go('review');
          }}
        />
      ) : null}
      {step === 'review' ? <ReviewStep {...sectionProps} providerName={PROVIDER_NAMES[provider]} /> : null}
      {step === 'countries' ? <CountriesSection {...sectionProps} /> : null}
      {step === 'preferences' ? <PreferencesSection {...sectionProps} /> : null}
      {step === 'screening' ? <ScreeningSection {...sectionProps} /> : null}
      {step === 'selfId' ? <SelfIdSection {...sectionProps} /> : null}
      {step === 'done' ? <DoneStep /> : null}

      {step === 'resume' || step === 'done' ? null : (
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              go(stepBefore(step));
            }}
          >
            Back
          </button>
          <span className="spacer" />
          {Object.keys(errors).length > 0 ? (
            <span className="field-error" role="alert">
              Fix the highlighted fields to continue.
            </span>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void next()}>
            {saving ? 'Saving…' : step === 'selfId' ? 'Finish setup' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}
