import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { startBackground } from '../background';

export default defineBackground(() => {
  // Nothing happens when a page loads; clicking the toolbar icon opens the
  // side panel (design.md "Starting a Fill"). The service worker is stopped
  // after 30 s idle, so long work belongs in the side panel (research §5).
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  startBackground();
});
