import type { FieldView } from '../../messaging/content';
import type { PanelController } from '../../sidepanel/controller';
import type { PanelState } from '../../sidepanel/state';
import { FieldRow } from './FieldRow';

const GROUPS = [
  { id: 'filled', title: 'Filled' },
  { id: 'needsReview', title: 'Needs your review' },
  { id: 'couldNotFill', title: "Couldn't fill" },
] as const;

type GroupId = (typeof GROUPS)[number]['id'];

/** Every field of the Fill, each in exactly one group (design.md "What you see"). */
export function OutcomeGroups({
  state,
  controller,
}: {
  readonly state: PanelState;
  readonly controller: PanelController;
}) {
  const fields = state.view?.fields ?? [];
  const waiting = fields.filter((f) => f.outcome === null);
  return (
    <>
      {waiting.length === 0 ? null : (
        <section className="group" data-testid="outcome-awaiting">
          <h2>Asking the AI</h2>
          <ul>
            {waiting.map((field) => (
              <FieldRow
                key={field.fieldId}
                field={field}
                draft={state.drafts[field.fieldId]}
                controller={controller}
              />
            ))}
          </ul>
        </section>
      )}
      {GROUPS.map((group) => {
        const inGroup = fields.filter((f) => groupOf(f) === group.id);
        return (
          <section key={group.id} className="group" data-group={group.id} data-testid={`outcome-${group.id}`}>
            <h2>
              {group.title} <span className="muted">{state.view === null ? '' : inGroup.length}</span>
            </h2>
            {inGroup.length === 0 ? (
              <p className="muted small">{state.view === null ? 'Nothing yet.' : 'None.'}</p>
            ) : (
              <ul>
                {inGroup.map((field) => (
                  <FieldRow
                    key={field.fieldId}
                    field={field}
                    draft={state.drafts[field.fieldId]}
                    controller={controller}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

function groupOf(field: FieldView): GroupId | null {
  return field.outcome?.kind ?? null;
}
