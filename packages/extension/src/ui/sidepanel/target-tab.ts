import { browser } from 'wxt/browser';

/**
 * The tab this side panel works on: the active tab of its window. e2e tests
 * open sidepanel.html in a tab of its own, so they pass `?tabId=<id>` instead
 * (see e2e/harness.ts `openSidePanel`).
 */
export async function targetTabId(): Promise<number | null> {
  const fromQuery = tabIdFromQuery();
  if (fromQuery !== null) return fromQuery;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

/** Follows the window's active tab, unless the page was opened for one tab (`?tabId=`). */
export function followActiveTab(onChange: (tabId: number) => void): () => void {
  if (tabIdFromQuery() !== null) return () => undefined;
  let windowId: number | null = null;
  void browser.windows.getCurrent().then((w) => {
    windowId = w.id ?? null;
  });
  const activated = (info: { tabId: number; windowId: number }) => {
    if (windowId === null || info.windowId === windowId) onChange(info.tabId);
  };
  browser.tabs.onActivated.addListener(activated);
  return () => {
    browser.tabs.onActivated.removeListener(activated);
  };
}

function tabIdFromQuery(): number | null {
  const fromQuery = Number.parseInt(new URLSearchParams(location.search).get('tabId') ?? '', 10);
  return Number.isInteger(fromQuery) ? fromQuery : null;
}
