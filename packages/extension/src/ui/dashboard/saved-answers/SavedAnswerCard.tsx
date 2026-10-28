import type { SavedAnswer } from '@employ-me/core';
import { useState } from 'react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';
import { formatDate } from '../format';
import { SavedAnswerEditor } from './SavedAnswerEditor';

const SOURCE: Readonly<Record<SavedAnswer['source'], string>> = {
  draft: 'From a Draft you accepted',
  manual: 'Added by you',
  import: 'Imported',
};

export function SavedAnswerCard({ saved }: { readonly saved: SavedAnswer }) {
  const store = useDataStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const overrides = Object.entries(saved.employerOverrides);

  if (editing) {
    return (
      <li className="card">
        <SavedAnswerEditor
          saved={saved}
          onDone={() => {
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="card" data-testid="saved-answer">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <strong style={{ flex: 1 }}>{saved.question}</strong>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setEditing(true);
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn btn-small btn-danger"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Delete
        </button>
      </div>
      <p className="prose" style={{ marginTop: 8, maxHeight: 160 }}>
        {saved.answer === '' ? <span className="muted">(empty)</span> : saved.answer}
      </p>
      {overrides.length === 0 ? null : (
        <ul className="stack" style={{ gap: 6, margin: '8px 0 0', paddingLeft: 18 }}>
          {overrides.map(([employer, text]) => (
            <li key={employer}>
              <span className="badge">{employer}</span> <span className="muted">{text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="muted small" style={{ marginTop: 8 }}>
        {SOURCE[saved.source]} · updated {formatDate(saved.updatedAt)}
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete this Saved Answer?"
          confirmLabel="Delete"
          danger
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            void store.deleteSavedAnswer(saved.id).then((r) => {
              toast(r.ok ? 'Saved Answer deleted.' : r.error.message);
            });
          }}
        >
          <p>Forms that ask this question will need a new answer from you or a new Draft.</p>
        </ConfirmDialog>
      ) : null}
    </li>
  );
}
