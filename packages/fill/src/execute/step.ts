import { plan as planForm, type FillPlan } from '../plan';
import { waitForQuiet } from './quiet';

export function replan(previous: FillPlan): FillPlan {
  const { doc, profile, savedAnswers, options } = previous.context;
  return planForm(doc, profile, savedAnswers, options);
}

/** Lets the page's own scripts react (render new sections, conditional questions) before the Fill looks again. */
export function settle({ context: { adapter, doc } }: FillPlan): Promise<void> {
  return waitForQuiet(adapter.findForm(doc) ?? doc.body);
}
