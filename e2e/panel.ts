import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect } from './harness';

// Helpers for the side-panel specs: the panel's own test ids
// (packages/extension/src/ui/sidepanel/), and the job site's public job API
// answered locally.

export function fieldRow(panel: Page, fieldId: string) {
  return panel.locator(`[data-testid="field"][data-field-id="${fieldId}"]`);
}

/** Clicks Fill and waits until the Fill, the Provider round and the Drafts are done. */
export async function clickFill(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: 'Fill', exact: true }).click();
  await expect(panel.getByTestId('fill-done')).toBeVisible({ timeout: 60_000 });
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
