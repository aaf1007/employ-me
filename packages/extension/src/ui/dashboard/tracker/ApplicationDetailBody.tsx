import { STATUSES, type Application } from '@employ-me/core';
import { useState } from 'react';
import { STATUS_LABELS } from '../../../tracker';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../common/toast-context';
import { countryName } from '../country-options';
import { useDataStore } from '../data/store-context';
import { formatDate } from '../format';
import { SnapshotView } from './SnapshotView';

const HOW: Readonly<Record<Application['source'], string>> = {
  confirmation: 'Recorded when the job site confirmed your submission',
  didYouApply: 'Recorded when you said you applied',
  manual: 'Added by you',
  import: 'Imported from CSV',
};

/** One Application: Status, notes and Snapshot. */
export function ApplicationDetailBody({
  application,
  onClose,
}: {
  readonly application: Application;
  readonly onClose: () => void;
}) {
  const store = useDataStore();
  const toast = useToast();
  // null while you aren't editing: then the saved notes show, even if another tab changes them.
  const [notes, setNotes] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { posting } = application;
  const safeUrl = /^https?:\/\//i.test(posting.url) ? posting.url : null;

  const where = [
    posting.company ?? posting.key.employer,
    posting.location,
    posting.country === undefined ? undefined : countryName(posting.country),
  ]
    .filter((part) => part !== undefined && part !== '')
    .join(' · ');

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h2 data-testid="detail-title">{posting.title ?? '(no title)'}</h2>
          <div className="muted">{where}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-small" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {safeUrl === null ? null : (
        <a href={safeUrl} target="_blank" rel="noreferrer noopener">
          Open the Posting ↗
        </a>
      )}
      <dl className="kv">
        <dt>Applied</dt>
        <dd>{formatDate(application.appliedAt)}</dd>
        <dt>How</dt>
        <dd>{HOW[application.source]}</dd>
      </dl>

      <div>
        <h3 className="small muted" style={{ margin: '0 0 6px' }}>
          Status
        </h3>
        <div className="chips" role="group" aria-label="Change Status">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="chip"
              aria-pressed={application.status === status}
              onClick={() => {
                if (status === application.status) return;
                void store.updateApplication(application.id, { status }).then((r) => {
                  toast(r.ok ? `Status changed to ${STATUS_LABELS[status]}.` : r.error.message);
                });
              }}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="application-notes">Notes</label>
        <textarea
          id="application-notes"
          rows={4}
          data-testid="application-notes"
          value={notes ?? application.notes}
          placeholder="Recruiter, interview dates, anything you want to remember"
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        {notes === null || notes === application.notes ? null : (
          <div className="row">
            <span className="spacer" />
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setNotes(null);
              }}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => {
                void store.updateApplication(application.id, { notes }).then((r) => {
                  if (r.ok) setNotes(null);
                  toast(r.ok ? 'Notes saved.' : r.error.message);
                });
              }}
            >
              Save notes
            </button>
          </div>
        )}
      </div>

      <div>
        <h3 className="small muted" style={{ margin: '0 0 6px' }}>
          Snapshot
        </h3>
        {application.snapshot === undefined ? (
          <p className="muted" style={{ margin: 0 }} data-testid="no-snapshot">
            No Snapshot. Applications you add by hand or import don’t have one.
          </p>
        ) : (
          <SnapshotView snapshot={application.snapshot} />
        )}
      </div>

      <div className="row">
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-small btn-danger"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Delete Application
        </button>
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete this Application?"
          confirmLabel="Delete"
          danger
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            void store.deleteApplication(application.id).then((r) => {
              toast(r.ok ? 'Application deleted.' : r.error.message);
              if (r.ok) onClose();
            });
          }}
        >
          <p>
            Its notes and Snapshot are deleted too. The already-applied warning won’t show for this Posting
            any more.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
