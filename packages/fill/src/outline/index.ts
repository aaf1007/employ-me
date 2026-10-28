import * as act from '../act';
import type { FillReport } from '../execute';
import type { ExtractedField } from '../types';

/**
 * Outlines every field on the page in the colour of its group in the side
 * panel: Filled, Needs your review, Couldn't fill (design.md "What you
 * see"). Fields still waiting for the Provider get none yet.
 */
export function showOutcomes(report: FillReport): void {
  const onPage = new Map(report.plan.fields.map((p) => [p.field.fieldId, p.field]));
  const outlined = new Set<string>();
  for (const outcome of report.outcomes) {
    const field = onPage.get(outcome.fieldId);
    if (field === undefined) continue;
    act.outlineField(outlineTarget(field), outcome.kind);
    outlined.add(outcome.fieldId);
  }
  for (const [fieldId, field] of onPage) {
    if (!outlined.has(fieldId)) act.outlineField(outlineTarget(field), null);
  }
}

/** Removes every outline the Fill drew, restoring the page's own styles. */
export function clearOutcomes(): void {
  act.clearOutlines();
}

/** react-select's input is a sliver inside its control box: outline the box the user sees. */
function outlineTarget(field: ExtractedField): Element {
  if (field.widget === 'combobox' || field.widget === 'comboboxMultiple') {
    return field.element.closest('[class*="control"], [class*="Control"], .select-shell') ?? field.element;
  }
  return field.element;
}
