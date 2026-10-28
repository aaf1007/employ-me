/** The parts of chrome.action and chrome.sidePanel the toolbar icon uses; tests pass fakes. */
export interface ToolbarApis {
  readonly action: {
    readonly onClicked: { addListener(listener: (tab: { readonly windowId: number }) => void): void };
  };
  readonly sidePanel: {
    setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void>;
    open(options: { windowId: number }): Promise<void>;
  };
}

/**
 * Clicking the toolbar icon opens the side panel (design.md "Starting a
 * Fill"). It opens from `action.onClicked`, not `openPanelOnActionClick`:
 * Chrome grants activeTab only for a click it delivers to the extension, and
 * with `openPanelOnActionClick` it delivers none (Chromium's
 * extension_action_runner.cc, crbug.com/40904917). The generic fallback needs
 * activeTab to read a company's own site when you click Fill there.
 */
export function openPanelFromToolbar(apis: ToolbarApis): void {
  // Chrome keeps the panel behavior across updates: switch the old one off.
  void apis.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  apis.action.onClicked.addListener((tab) => {
    // Called at once, in the click: sidePanel.open needs the user's gesture.
    void apis.sidePanel.open({ windowId: tab.windowId });
  });
}
