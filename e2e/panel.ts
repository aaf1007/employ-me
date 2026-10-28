import type { BrowserContext, Frame, Locator, Page } from '@playwright/test';
import { expect } from './harness';

// Helpers for the side-panel specs: the panel's own test ids
// (packages/extension/src/ui/sidepanel/), and the job site's public job API
// answered locally.
//
// Every panel action that re-plans (Fill, the page's next step, Draft,
// Polish, Accept) is a request to the content script that takes its time,
// more so on a busy machine, and a re-plan queues behind the one before it.
// The helpers below wait for the state each action ends in, so the next
// action never races one still in flight (CLAUDE.md "End-to-end tests").

export function fieldRow(panel: Page, fieldId: string) {
  return panel.locator(`[data-testid="field"][data-field-id="${fieldId}"]`);
}

const fillDone = (panel: Page) => panel.getByTestId('fill-done');
/** What a Fill may take, the first step's (clickFill) and each later step's (nextStep) alike. */
const A_FILL = { timeout: 60_000 };

/** Clicks Fill and waits until the Fill, the Provider round and the Drafts are done. */
export async function clickFill(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(fillDone(panel)).toBeVisible(A_FILL);
}

/**
 * You move the form on yourself (`press`: Next, Save and Continue). Waits
 * until the same Fill has carried on to the new step, `firstField` among its
 * fields, and finished asking the AI about it. "fill-done" alone isn't
 * enough: it still shows from the step before until the panel notices.
 */
export async function nextStep(
  panel: Page,
  press: () => Promise<void>,
  firstField: string,
): Promise<Locator> {
  await press();
  const row = fieldRow(panel, firstField);
  await expect(row).toBeVisible(A_FILL);
  await expect(fillDone(panel)).toBeVisible(A_FILL);
  return row;
}

/**
 * The Draft card of `fieldId` once its Draft is in the plan. The card says
 * "ready" as soon as the Provider answers, before the re-plan that puts the
 * field under Needs your review has landed: the field's outcome is the state
 * to wait for.
 */
export async function draftReady(panel: Page, fieldId: string): Promise<Locator> {
  const row = fieldRow(panel, fieldId);
  const card = row.getByTestId('draft-card');
  await expect(card).toHaveAttribute('data-status', 'ready');
  await expect(row).toHaveAttribute('data-outcome', 'needsReview');
  return card;
}

/** Accepts the Draft as the card shows it, and waits for the re-plan that writes it into the form. */
export async function acceptDraft(panel: Page, fieldId: string): Promise<void> {
  const row = fieldRow(panel, fieldId);
  await row.getByTestId('draft-card').getByRole('button', { name: 'Accept Draft' }).click();
  await expect(row).toHaveAttribute('data-outcome', 'filled');
}

/**
 * Answers the Posting's public job API (research §7) from the test, as the
 * real API would: the net module fetches it from the side panel.
 */
export async function servePublicApi(context: BrowserContext, url: string, body: unknown): Promise<void> {
  await context.route(
    (u) => u.href === url,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      }),
  );
}

/** Counts submit events the form's page sees from now on (read with `submits`). */
export async function countSubmits(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    const counter = { submits: 0 };
    Object.assign(globalThis, { employMeSubmits: counter });
    document.addEventListener('submit', () => (counter.submits += 1), true);
  });
}

export function submits(frame: Frame): Promise<number> {
  return frame.evaluate(
    () => (globalThis as unknown as { employMeSubmits: { submits: number } }).employMeSubmits.submits,
  );
}

/** The outline style a field has on the page now. */
export function outlineOf(frame: Frame, selector: string): Promise<string> {
  return frame
    .locator(selector)
    .first()
    .evaluate((el) => (el instanceof HTMLElement ? el.style.outlineStyle : ''));
}
