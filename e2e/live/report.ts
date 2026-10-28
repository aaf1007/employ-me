import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Frame, Page } from '@playwright/test';
import { readValues } from '../fill-page';
import { LIVE_DIR } from './ledger';

// What one live Fill did, written to .live-runs/<date>/ for review by hand:
// each field as the side panel shows it, its type from the debug report,
// and the value the form itself shows now (read from the DOM, not from the
// engine). The values are the made-up persona's.

export interface PanelField {
  readonly fieldId: string;
  readonly label: string;
  readonly outcome: string;
  readonly reason: string;
  readonly fix: string;
  readonly suggestion: string;
  readonly byCountry: string;
  readonly candidates: string;
  readonly draft: { status: string; text: string; flagged: string } | null;
}

interface DebugField {
  readonly fieldId: string;
  readonly fieldType: string;
  readonly classifiedBy: string;
  readonly control: string;
  readonly required: boolean;
  readonly outcome: { kind: string; source?: string; reason?: string };
}

export async function panelFields(panel: Page): Promise<PanelField[]> {
  return panel.locator('[data-testid="field"]').evaluateAll((rows) => {
    const text = (row: Element, testId: string) =>
      (row.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return rows.map((row) => {
      const card = row.querySelector('[data-testid="draft-card"]');
      const draftText = card?.querySelector('[data-testid="draft-text"]');
      return {
        fieldId: row.getAttribute('data-field-id') ?? '',
        label: (row.querySelector('.field-label')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        outcome: row.getAttribute('data-outcome') ?? '',
        reason: text(row, 'field-reason'),
        fix: text(row, 'field-fix'),
        suggestion: text(row, 'field-suggestion'),
        byCountry: text(row, 'field-by-country'),
        candidates: (row.querySelector('.muted.small:not([data-testid])')?.textContent ?? '').trim(),
        draft:
          card === null
            ? null
            : {
                status: card.getAttribute('data-status') ?? '',
                text: draftText instanceof HTMLTextAreaElement ? draftText.value : '',
                flagged: text(card, 'draft-flagged'),
              },
      };
    });
  });
}

/** The panel's "Copy debug report", caught on its way to the clipboard. */
export async function debugReport(panel: Page): Promise<{ fields: DebugField[]; [key: string]: unknown }> {
  await panel.evaluate(() => {
    const copied = { text: '' };
    Object.assign(globalThis, { employMeCopied: copied });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          copied.text = text;
          return Promise.resolve();
        },
      },
    });
  });
  await panel.getByRole('button', { name: 'Copy debug report' }).click();
  await panel.getByTestId('debug-copied').waitFor();
  const text = await panel.evaluate(
    () => (globalThis as unknown as { employMeCopied: { text: string } }).employMeCopied.text,
  );
  return JSON.parse(text) as { fields: DebugField[] };
}

export interface FieldReport extends PanelField {
  readonly fieldType: string;
  readonly classifiedBy: string;
  readonly control: string;
  readonly required: boolean;
  readonly source: string;
  /** What the form shows now, read from its DOM. */
  readonly onForm: string;
}

export async function fieldReports(
  panel: Page,
  frame: Frame,
): Promise<{ fields: FieldReport[]; debug: unknown }> {
  const fields = await panelFields(panel);
  const debug = await debugReport(panel);
  const values = await readValues(
    frame,
    fields.map((f) => f.fieldId),
  );
  const reports = fields.map((field) => {
    const line = debug.fields.find((d) => d.fieldId === field.fieldId);
    return {
      ...field,
      fieldType: line?.fieldType ?? '',
      classifiedBy: line?.classifiedBy ?? '',
      control: line?.control ?? '',
      required: line?.required ?? false,
      source: line?.outcome.source ?? '',
      onForm: values[field.fieldId] ?? '',
    };
  });
  return { fields: reports, debug };
}

export function runDir(): string {
  return path.join(LIVE_DIR, new Date().toISOString().slice(0, 10));
}

export async function writeRun(name: string, run: unknown): Promise<string> {
  const dir = runDir();
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  await writeFile(file, `${JSON.stringify(run, null, 2)}\n`);
  return file;
}

export function tally(fields: readonly FieldReport[]) {
  const count = (outcome: string) => fields.filter((f) => f.outcome === outcome).length;
  return {
    fields: fields.length,
    filled: count('filled'),
    needsReview: count('needsReview'),
    couldNotFill: count('couldNotFill'),
    awaiting: count('awaiting'),
  };
}
