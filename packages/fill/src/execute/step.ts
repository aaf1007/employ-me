import { plan as planForm, type FillPlan } from '../plan';
import type { ExtractedField } from '../types';
import type { FillReport } from './index';
import { waitForQuiet } from './quiet';

export function replan(previous: FillPlan): FillPlan {
  const { doc, profile, savedAnswers, options } = previous.context;
  return planForm(doc, profile, savedAnswers, options);
}

/** Lets the page's own scripts react (render new sections, conditional questions) before the Fill looks again. */
export function settle({ context: { adapter, doc } }: FillPlan): Promise<void> {
  return waitForQuiet(doc, () => adapter.findForm(doc) ?? doc.body);
}

/**
 * The first plan of a step (the first Fill, or a step no earlier execute saw)
 * waits for the adapter to say the step has all its fields, and is made again
 * if the step changed meanwhile: fields arrived or left, or the page
 * re-rendered a control (act/ must get the element on the page now). Re-plans
 * of a step already seen go ahead at once (research 2026-10-28 §7.4).
 */
export async function readyStep(plan: FillPlan, previous: FillReport | undefined): Promise<FillPlan> {
  const { adapter, doc } = plan.context;
  const form = adapter.findForm(doc);
  if (form === null) return plan;
  const known = new Set(previous?.planned.map((p) => p.field.fieldId));
  const newStep =
    previous === undefined ||
    plan.fields.length === 0 ||
    plan.fields.some((p) => !known.has(p.field.fieldId));
  if (!newStep) return plan;
  await adapter.waitForStepReady(form);
  const now = adapter.findForm(doc);
  const shown = now === null ? [] : adapter.extract(now);
  const unchanged =
    shown.length === plan.fields.length &&
    shown.every((field, i) => {
      const planned = plan.fields[i]?.field;
      return planned !== undefined && sameField(planned, field);
    });
  return unchanged ? plan : replan(plan);
}

/**
 * The same control, still on the page, showing the same question. Options
 * count only when the page shows some: a plan may carry options from the
 * Posting's public API for a field that shows none.
 */
function sameField(planned: ExtractedField, shown: ExtractedField): boolean {
  return (
    planned.fieldId === shown.fieldId &&
    planned.element === shown.element &&
    planned.widget === shown.widget &&
    planned.label === shown.label &&
    planned.choices.length === shown.choices.length &&
    planned.choices.every((choice, i) => choice.element === shown.choices[i]?.element) &&
    (shown.options.length === 0 || planned.options.join('\n') === shown.options.join('\n'))
  );
}
