import { browser } from 'wxt/browser';

/**
 * The tab this side panel works on: the active tab of its window. e2e tests
 * open sidepanel.html in a tab of its own, so they pass `?tabId=<id>` instead
 * (see e2e/harness.ts `openSidePanel`).
 */
export async function targetTabId(): Promise<number | null> {
  const fromQuery = Number.parseInt(new URLSearchParams(location.search).get('tabId') ?? '', 10);
  if (Number.isInteger(fromQuery)) return fromQuery;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}
