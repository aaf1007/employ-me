import { STATUSES, type Status } from '@employ-me/core';
import { useState } from 'react';
import { appliedAtFrom, postingKeyFor, postingUrl, STATUS_LABELS } from '../../../tracker';
import { useToast } from '../common/toast-context';
import { SelectField } from '../controls/SelectField';
import { TextAreaField } from '../controls/TextAreaField';
import { TextField } from '../controls/TextField';
import { COUNTRY_OPTIONS } from '../country-options';
import { useDataStore } from '../data/store-context';
import { formatDate } from '../format';

const STATUS_OPTIONS = STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }));

/** An Application you add by hand: it has no Snapshot (design.md "Tracking"). */
export function AddApplicationForm({ onDone }: { readonly onDone: (id: string | null) => void }) {
  const store = useDataStore();
  const toast = useToast();
  const [company, setCompany] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [appliedOn, setAppliedOn] = useState('');
  const [status, setStatus] = useState<Status>('applied');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const link = postingUrl(url);
    const found: Record<string, string> = {};
    if (company.trim() === '') found['company'] = 'Required';
    if (link === null) found['url'] = 'Enter the Posting’s full link, starting with https://';
    const applied = appliedAtFrom(appliedOn, new Date());
    if (applied === null) found['appliedAt'] = 'Enter a date';
    setErrors(found);
    if (link === null || applied === null || Object.keys(found).length > 0) return;

    const posting = {
      key: postingKeyFor(link),
      url: link.href,
      company: company.trim(),
      ...(title.trim() === '' ? {} : { title: title.trim() }),
      ...(location.trim() === '' ? {} : { location: location.trim() }),
      ...(country === '' ? {} : { country }),
    };
    setBusy(true);
    if (duplicateOf === null) {
      const existing = await store.findApplicationsByPosting(posting.key);
      const first = existing.ok ? existing.value[0] : undefined;
      if (first !== undefined) {
        setBusy(false);
        setDuplicateOf(formatDate(first.appliedAt));
        return;
      }
    }
    const result = await store.createApplication({
      source: 'manual',
      posting,
      appliedAt: applied.value,
      status,
      notes,
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.issues ?? []).map((issue) => [issue.path, issue.message])));
      toast(result.error.message);
      return;
    }
    toast('Application added.');
    onDone(result.value.id);
  };

  return (
    <section className="card stack" style={{ gap: 12 }} data-testid="add-application">
      <h2>Add an Application</h2>
      <div className="grid">
        <TextField
          label="Company"
          path="company"
          error={errors['company']}
          value={company}
          onChange={setCompany}
        />
        <TextField
          label="Posting URL"
          type="url"
          placeholder="https://"
          path="url"
          error={errors['url'] ?? errors['posting.url']}
          value={url}
          onChange={(v) => {
            setUrl(v);
            setDuplicateOf(null);
          }}
        />
        <TextField label="Title" path="title" value={title} onChange={setTitle} />
        <TextField label="Location" path="location" value={location} onChange={setLocation} />
        <SelectField
          label="Country"
          path="country"
          value={country}
          options={COUNTRY_OPTIONS}
          blank="Not sure"
          onChange={setCountry}
        />
        <TextField
          label="Applied on"
          type="date"
          hint="Leave empty for today."
          path="appliedAt"
          error={errors['appliedAt']}
          value={appliedOn}
          onChange={setAppliedOn}
        />
        <SelectField
          label="Status"
          path="status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            if (v !== '') setStatus(v);
          }}
        />
        <TextAreaField label="Notes" wide rows={3} path="notes" value={notes} onChange={setNotes} />
      </div>
      {duplicateOf === null ? null : (
        <div className="notice notice-warn" role="alert" data-testid="already-applied">
          <strong>You already applied to this Posting</strong>
          <p>
            Your Tracker has an Application for it from {duplicateOf}. Add it again only if you applied twice.
          </p>
        </div>
      )}
      <div className="row">
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            onDone(null);
          }}
        >
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void add()}>
          {duplicateOf === null ? 'Add Application' : 'Add it anyway'}
        </button>
      </div>
    </section>
  );
}
