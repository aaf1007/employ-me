import type { PanelController } from '../../sidepanel/controller';
import type { DraftState } from '../../sidepanel/state';

/**
 * One Draft (design.md "Drafts"): editable, with the claims that don't come
 * from your information flagged. Nothing goes into the form until you
 * accept it; your accepted version becomes a Saved Answer. In polish mode
 * (the form has an AI-use policy) you write first and the AI only tidies.
 */
export function DraftCard({
  fieldId,
  draft,
  controller,
}: {
  readonly fieldId: string;
  readonly draft: DraftState;
  readonly controller: PanelController;
}) {
  const polish = draft.request.mode === 'polish';
  const busy = draft.status === 'drafting';
  const accepted = draft.status === 'accepted';
  return (
    <div className="card draft" data-testid="draft-card" data-status={draft.status}>
      {polish ? (
        <p className="small muted" data-testid="polish-mode">
          This form has an AI-use policy, so write your own answer first. employ-me can polish it.
        </p>
      ) : null}
      {busy ? <p className="muted">Drafting…</p> : null}
      {draft.error === undefined ? null : (
        <div className="error" role="alert">
          <strong>{draft.error.message}</strong>
          <p>{draft.error.fix}</p>
        </div>
      )}
      {busy ? null : (
        <textarea
          aria-label={polish ? 'Your answer' : 'Draft'}
          data-testid="draft-text"
          value={draft.text}
          readOnly={accepted}
          onChange={(event) => {
            controller.drafts.setText(fieldId, event.target.value);
          }}
        />
      )}
      {draft.flagged.length === 0 ? null : (
        <div data-testid="draft-flagged">
          <p className="small">Not from your information. Check before you accept:</p>
          <ul className="flagged">
            {draft.flagged.map((claim, index) => (
              <li key={index}>{claim}</li>
            ))}
          </ul>
        </div>
      )}
      {accepted ? (
        <p className="small" data-testid="draft-accepted">
          In the form, and kept as a Saved Answer.
        </p>
      ) : (
        <div className="row">
          <button
            type="button"
            disabled={busy || draft.text.trim() === ''}
            onClick={() => void controller.drafts.accept(fieldId)}
          >
            Accept Draft
          </button>
          {polish ? (
            <button
              type="button"
              disabled={busy || draft.text.trim() === ''}
              onClick={() => void controller.drafts.draft(fieldId)}
            >
              Polish
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void controller.drafts.draft(fieldId)}>
              {draft.status === 'failed' ? 'Retry' : 'Draft again'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
