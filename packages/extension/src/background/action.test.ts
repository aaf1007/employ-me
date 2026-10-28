import { describe, expect, it } from 'vitest';
import { openPanelFromToolbar } from './action';

describe('the toolbar icon', () => {
  it('opens the side panel in the click itself, so Chrome grants activeTab for the page', () => {
    const calls: unknown[] = [];
    let click: (tab: { windowId: number }) => void = () => undefined;
    openPanelFromToolbar({
      action: {
        onClicked: {
          addListener: (listener) => {
            click = listener;
          },
        },
      },
      sidePanel: {
        setPanelBehavior: (behavior) => {
          calls.push({ setPanelBehavior: behavior });
          return Promise.resolve();
        },
        open: (options) => {
          calls.push({ open: options });
          return Promise.resolve();
        },
      },
    });
    expect(calls).toEqual([{ setPanelBehavior: { openPanelOnActionClick: false } }]);

    click({ windowId: 7 });
    // Synchronously: an await before open() would lose the gesture.
    expect(calls.at(-1)).toEqual({ open: { windowId: 7 } });
  });
});
