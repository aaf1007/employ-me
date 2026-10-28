/**
 * Who sent a runtime message. Extension pages (dashboard, side panel) are
 * served from the extension's own origin; content scripts run in a job
 * site's tab and report that page's URL.
 */
export type SenderKind = 'extensionPage' | 'contentScript' | 'other';

export interface Sender {
  readonly id?: string;
  readonly url?: string;
  readonly tab?: unknown;
}

export function senderKind(sender: Sender, extensionId: string): SenderKind {
  if (sender.id !== extensionId) return 'other';
  if (sender.url?.startsWith(`chrome-extension://${extensionId}/`) === true) return 'extensionPage';
  if (sender.tab !== undefined) return 'contentScript';
  return 'other';
}
