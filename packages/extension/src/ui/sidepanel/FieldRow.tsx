import type { FieldView } from '../../messaging/content';
import type { PanelController } from '../../sidepanel/controller';
import type { DraftState } from '../../sidepanel/state';
import { DraftCard } from './DraftCard';
import { outcomeText } from './reasons';

/** One field under Filled, Needs your review or Couldn't fill. */
export function FieldRow({
  field,
  draft,
  controller,
}: {
  readonly field: FieldView;
  readonly draft: DraftState | undefined;
  readonly controller: PanelController;
}) {
  const { outcome } = field;
  const label = field.label === '' ? field.fieldId : field.label;
  const canDraft = field.draft !== undefined && draft === undefined && outcome?.kind !== 'filled';
  return (
    <li
      className="field"
      data-testid="field"
      data-field-id={field.fieldId}
      data-outcome={outcome?.kind ?? 'awaiting'}
      data-required={field.required}
    >
      <span className="field-label">
        {label}
        {field.required ? <span className="muted"> *</span> : null}
      </span>
      {outcome === null ? (
        <span className="muted small">Asking the AI…</span>
      ) : (
        <span className="small" data-testid="field-reason">
          {outcomeText(outcome)}
        </span>
      )}
      {outcome?.kind === 'couldNotFill' ? (
        <span className="small muted" data-testid="field-fix">
          {outcome.fix}
        </span>
      ) : null}
      {field.userEdited ? <span className="tag">Changed by you</span> : null}
      {field.suggestion === undefined ? null : (
        <div className="row small">
          <span data-testid="field-suggestion">Suggestion: {field.suggestion}</span>
          {outcome?.kind === 'needsReview' && outcome.reason === 'similarSavedAnswer' ? (
            <button type="button" onClick={() => void controller.drafts.useSuggestion(field.fieldId)}>
              Use this
            </button>
          ) : null}
        </div>
      )}
      {field.byCountry === undefined ? null : (
        <ul className="small" data-testid="field-by-country">
          {field.byCountry.map((answer) => (
            <li key={answer.country}>
              {answer.country}: {answer.text}
            </li>
          ))}
        </ul>
      )}
      {field.candidates === undefined ? null : (
        <span className="small muted">Options that fit: {field.candidates.join(' · ')}</span>
      )}
      {canDraft ? (
        <div className="row">
          <button type="button" onClick={() => void controller.drafts.draft(field.fieldId)}>
            Draft
          </button>
        </div>
      ) : null}
      {draft === undefined ? null : (
        <DraftCard fieldId={field.fieldId} draft={draft} controller={controller} />
      )}
    </li>
  );
}
