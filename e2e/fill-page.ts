import { readFile } from 'node:fs/promises';
import type { Frame, Page } from '@playwright/test';
import type { FieldDescriptor, FieldOutcome, Posting } from '@employ-me/core';
import type { ProviderFeedback } from '@employ-me/fill';
import { FILL_BUNDLE } from './fill-bundle/build';
import type { FormFixture } from './forms';
import { TEST_PROFILE, TEST_RESUME, TEST_SAVED_ANSWERS } from './profile';

// Drives the fill engine inside a replayed form, and reads the form back
// independently of the engine. Everything that crosses into the page is
// plain JSON: the engine's own types stay on the page side.

export interface FillRun {
  readonly outcomes: readonly FieldOutcome[];
  readonly awaiting: readonly { fieldId: string; need: string }[];
  readonly fields: readonly FieldDescriptor[];
  readonly posting: Posting | null;
  readonly country: unknown;
  readonly draftRequests: readonly string[];
  readonly draftModes: readonly string[];
  readonly mappingRequest: readonly string[];
  /** The mapFields request body as JSON, to check nothing personal is in it. */
  readonly providerRequestJson: string;
}

interface FillApi {
  plan(doc: Document, profile: unknown, saved: unknown, options: unknown): unknown;
  execute(plan: unknown): Promise<{
    outcomes: FieldOutcome[];
    awaitingProvider: { fieldId: string; need: string }[];
    fields: FieldDescriptor[];
    plan: {
      posting: Posting | null;
      country: unknown;
      draftRequests: { fieldId: string; mode: string }[];
      providerRequest: { fields: { fieldId: string }[] } | null;
    };
  }>;
}

/** The frame holding the form: the page itself, or its embed once that has navigated to the form. */
export async function formFrame(page: Page, form: FormFixture): Promise<Frame> {
  const match = form.formFrame;
  if (match === undefined) return page.mainFrame();
  const holds = (frame: Frame) => frame.url().includes(match);
  // Nothing is awaited between the look and the listener, so a navigation can't slip between them.
  return (
    page.frames().find(holds) ??
    (await page.waitForEvent('framenavigated', { predicate: holds, timeout: 20_000 }))
  );
}

/** Puts the engine in the frame and counts any submit event the page sees. */
export async function prepare(frame: Frame): Promise<void> {
  const bundle = await readFile(FILL_BUNDLE, 'utf8');
  await frame.evaluate(bundle);
  await frame.evaluate(() => {
    const counter = { submits: 0 };
    Object.assign(globalThis, { employMeTestCounter: counter });
    document.addEventListener('submit', () => (counter.submits += 1), true);
  });
}

export async function runFill(frame: Frame, provider: ProviderFeedback): Promise<FillRun> {
  return frame.evaluate(
    async ({ profile, saved, resume, provider }) => {
      const fill = (globalThis as unknown as { employMeFill: FillApi }).employMeFill;
      const file = new File([resume.pdf], resume.meta.fileName, { type: resume.meta.mimeType });
      const planned = fill.plan(document, profile, saved, { resume: { meta: resume.meta, file }, provider });
      const report = await fill.execute(planned);
      return {
        outcomes: report.outcomes,
        awaiting: report.awaitingProvider,
        fields: report.fields,
        posting: report.plan.posting,
        country: report.plan.country,
        draftRequests: report.plan.draftRequests.map((d) => d.fieldId),
        draftModes: [...new Set(report.plan.draftRequests.map((d) => d.mode))],
        mappingRequest: report.plan.providerRequest?.fields.map((f) => f.fieldId) ?? [],
        providerRequestJson: JSON.stringify(report.plan.providerRequest),
      };
    },
    { profile: TEST_PROFILE, saved: TEST_SAVED_ANSWERS, resume: TEST_RESUME, provider },
  );
}

export async function submitCount(frame: Frame): Promise<number> {
  return frame.evaluate(
    () => (globalThis as unknown as { employMeTestCounter: { submits: number } }).employMeTestCounter.submits,
  );
}

/**
 * What each field shows now, read straight from the DOM by the test (not by
 * the engine): input values, chosen options' text, ticked boxes' labels.
 */
export async function readValues(frame: Frame, fieldIds: readonly string[]): Promise<Record<string, string>> {
  return frame.evaluate((ids) => {
    const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const labelOf = (input: Element) => {
      const id = input.getAttribute('id');
      const byFor = id === null ? null : document.querySelector(`label[for="${CSS.escape(id)}"]`);
      return text(byFor ?? input.closest('label') ?? input.nextElementSibling);
    };
    const fileInputs = [...document.querySelectorAll('input[type="file"]')];
    const read = (fieldId: string): string => {
      const [base = '', nth = '1'] = fieldId.split('#');
      const named = [...document.getElementsByName(base)];
      // Ashby: answers are buttons inside the field's [data-field-path] entry.
      const entry = document.querySelector(`[data-field-path="${CSS.escape(base)}"]`);
      if (entry !== null && entry.querySelector('[aria-pressed]') !== null) {
        return [...entry.querySelectorAll('[aria-pressed="true"]')].map(text).join(' | ');
      }
      // Ashby: a select-all-that-apply question, whose checkboxes are named after their options.
      const boxes = entry === null ? [] : [...entry.querySelectorAll('input[type="checkbox"]')];
      if (named.length === 0 && boxes.length > 1) {
        return boxes
          .filter((el) => el instanceof HTMLInputElement && el.checked)
          .map(labelOf)
          .join(' | ');
      }
      const ticks = named.filter(
        (el) => el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox'),
      );
      if (
        ticks.length > 1 ||
        (ticks.length === 1 && ticks[0] instanceof HTMLInputElement && ticks[0].type === 'radio')
      ) {
        return ticks
          .filter((el) => el instanceof HTMLInputElement && el.checked)
          .map(labelOf)
          .join(' | ');
      }
      // A lone checkbox, often next to a hidden input of the same name (Lever's consent boxes).
      const [lone] = ticks;
      if (lone instanceof HTMLInputElement) return lone.checked ? 'checked' : 'unchecked';
      const el =
        document.getElementById(base) ??
        named[0] ??
        entry?.querySelector('input:not([type="hidden"]), textarea, select, [role="combobox"]') ??
        document.querySelector(`[data-qa="${CSS.escape(base)}"], [data-testid="${CSS.escape(base)}"]`) ??
        (base === 'file' ? fileInputs[Number(nth) - 1] : null) ??
        null;
      if (el === null) {
        // Greenhouse swaps the file input for an upload widget once a file is attached.
        const upload = document.querySelector(`[aria-labelledby="upload-label-${CSS.escape(base)}"]`);
        if (upload !== null) {
          // Playwright's stubbed upload reports no progress events, so the widget stays at "uploading".
          if (upload.querySelector('[role="progressbar"]') !== null) return '<uploading>';
          return text(upload.querySelector('.file-upload__filename')) || text(upload);
        }
        return '<missing>';
      }
      if (el instanceof HTMLInputElement && el.type === 'checkbox')
        return el.checked ? 'checked' : 'unchecked';
      if (el instanceof HTMLInputElement && el.type === 'file') {
        // Some sites keep the file in their own state and clear the input; they show its name nearby.
        const shown = /[\w.-]+\.pdf\b/.exec(
          text(el.closest('label') ?? el.parentElement?.parentElement),
        )?.[0];
        return el.files?.[0]?.name ?? shown ?? '';
      }
      if (el instanceof HTMLSelectElement)
        return [...el.selectedOptions]
          .filter((o) => o.value !== '')
          .map((o) => text(o))
          .join(' | ');
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
        const shell = el.closest('.select__control, [class*="-control"], .select-shell');
        const chosen =
          shell === null
            ? []
            : [...shell.querySelectorAll('[class*="single-value"], [class*="multi-value__label"]')];
        if (chosen.length > 0) return chosen.map(text).join(' | ');
        return el instanceof HTMLInputElement ? el.value : text(el);
      }
      const pressed = [...el.querySelectorAll('[aria-pressed="true"]')];
      if (pressed.length > 0) return pressed.map(text).join(' | ');
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return '';
    };
    return Object.fromEntries(ids.map((id) => [id, read(id)]));
  }, fieldIds);
}
