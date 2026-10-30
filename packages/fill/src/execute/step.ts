import { plan as planForm, type FillPlan } from '../plan';
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
 * if more arrived meanwhile (research 2026-10-28 §7.4). Re-plans of a step
 * already seen go ahead at once.
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
  const planned = plan.fields.map((p) => p.field.fieldId).join('\n');
  const shown = adapter
    .extract(form)
    .map((f) => f.fieldId)
    .join('\n');
  return shown === planned ? plan : replan(plan);
}
