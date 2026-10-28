import { useState } from 'react';
import type { RefusedSavedAnswer } from '../../../storage';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';

/**
 * A Saved Answer kept before employ-me refused its kind of question. It is
 * never used or sent anywhere; all you can do is delete it.
 */
export function RefusedSavedAnswerCard({ refused }: { readonly refused: RefusedSavedAnswer }) {
  const store = useDataStore();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="card notice-warn" data-testid="refused-saved-answer">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <strong style={{ flex: 1 }}>{refused.question}</strong>
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
      <p className="small" style={{ marginTop: 8 }} data-testid="refused-note">
        employ-me no longer keeps answers to questions like this one: Self-ID questions, Attestations, and
        questions about passwords, SIN/SSN, date of birth or references. It isn’t used in a Fill, sent to the
        AI or put in a backup. Delete it, and answer it on the form yourself.
      </p>
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
            void store.deleteSavedAnswer(refused.id).then((r) => {
              toast(r.ok ? 'Saved Answer deleted.' : r.error.message);
            });
          }}
        >
          <p>It is removed from employ-me for good.</p>
        </ConfirmDialog>
      ) : null}
    </li>
  );
}
