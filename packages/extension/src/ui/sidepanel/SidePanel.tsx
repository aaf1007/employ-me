import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { FillPanel } from './FillPanel';
import { followActiveTab, targetTabId } from './target-tab';

/**
 * The side panel (design.md "Starting a Fill"): opened from the toolbar
 * icon, it works on the window's active tab and follows you to another tab.
 */
export function SidePanel() {
  const [tabId, setTabId] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    void targetTabId().then(setTabId);
    return followActiveTab(setTabId);
  }, []);

  const openDashboard = () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  };

  return (
    <main data-testid="sidepanel" className="panel">
      <header className="panel-header">
        <h1>employ-me</h1>
        <button type="button" onClick={openDashboard}>
          Dashboard
        </button>
      </header>
      {tabId === undefined ? null : tabId === null ? (
        <p className="muted">Open a Posting’s Application Form, then click the employ-me icon.</p>
      ) : (
        <FillPanel key={tabId} tabId={tabId} />
      )}
    </main>
  );
}
