import { useEffect, useMemo, useState } from 'react';
import type { DataError, ProfileFields } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';
import { toForm, validateForm } from '../profile-form';
import { focusFirstInvalid } from './focus';
import { ProfileSections } from './ProfileSections';

const NOTHING_PREFILLED: ReadonlySet<string> = new Set();

/** Every Profile section, editable, saved together. Mount it with a `key` per load. */
export function ProfileEditor({ saved }: { readonly saved: ProfileFields }) {
  const store = useDataStore();
  const toast = useToast();
  const [form, setForm] = useState(() => toForm(saved));
  const [showErrors, setShowErrors] = useState(false);
  const [failure, setFailure] = useState<DataError | null>(null);
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => JSON.stringify(toForm(saved)), [saved]);
  const validation = useMemo(() => validateForm(form), [form]);
  const dirty = JSON.stringify(form) !== initial;
  const errors = showErrors && !validation.ok ? validation.errors : {};

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  const save = async () => {
    if (!validation.ok) {
      setShowErrors(true);
      toast('Fix the highlighted fields, then save again.');
      focusFirstInvalid();
      return;
    }
    setSaving(true);
    const result = await store.saveProfileFields(validation.fields);
    setSaving(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setFailure(null);
    toast('Profile saved.');
  };

  return (
    <div className="stack" data-testid="profile-editor">
      {failure === null ? null : <ErrorNotice error={failure} title="Your Profile wasn’t saved." />}
      <ProfileSections form={form} errors={errors} prefilled={NOTHING_PREFILLED} onChange={setForm} />
      {dirty ? (
        <div className="save-bar" data-testid="save-bar">
          <span className="muted">You have unsaved changes.</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setForm(toForm(saved));
              setShowErrors(false);
            }}
          >
            Discard
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
