import { err, ok, type Result } from '@employ-me/core';
import { browser } from 'wxt/browser';
import {
  detectedSchema,
  fillAnswerSchema,
  sessionEventSchema,
  SESSION_PORT,
  type ContentError,
  type ContentRequest,
  type Detected,
  type FillView,
  type ProviderFeedbackMessage,
  type SessionEvent,
} from '../messaging/content';

/** The side panel's line to the job site's tab: its content script, and its loads and closes. */
export interface TabLink {
  /** The frame holding the Application Form (or the confirmation), or null when no frame answers. */
  detect(): Promise<Detected | null>;
  fill(request: Extract<ContentRequest, { type: 'fill' }>): Promise<Result<FillView, ContentError>>;
  feedback(provider: ProviderFeedbackMessage): Promise<Result<FillView, ContentError>>;
  endSession(): Promise<void>;
  /** Opens the Fill's session port. `onGone` runs when the form's document goes away. */
  openSession(onEvent: (event: SessionEvent) => void, onGone: () => void): () => void;
  /** Calls `onLoaded` when the tab finishes loading a page, `onClosed` when it closes. */
  watch(handlers: { readonly onLoaded: () => void; readonly onClosed: () => void }): () => void;
}

const UNREACHABLE: ContentError = {
  reason: 'noForm',
  message: 'The Application Form did not answer',
  fix: 'Reload the job site’s page, then click Fill again.',
};

export function tabLink(tabId: number): TabLink {
  const send = async (request: ContentRequest): Promise<unknown> => {
    try {
      return await browser.tabs.sendMessage(tabId, request);
    } catch (error) {
      // No content script in the tab (not a job site we know, or still loading).
      if (error instanceof Error) return undefined;
      throw error;
    }
  };
  const fillRequest = async (request: ContentRequest): Promise<Result<FillView, ContentError>> => {
    const answer = fillAnswerSchema.safeParse(await send(request));
    if (!answer.success) return err(UNREACHABLE);
    return answer.data.type === 'filled' ? ok(answer.data.view) : err(answer.data.error);
  };

  return {
    async detect() {
      const answer = detectedSchema.safeParse(await send({ type: 'detect' }));
      return answer.success ? answer.data : null;
    },
    fill: (request) => fillRequest(request),
    feedback: (provider) => fillRequest({ type: 'feedback', provider }),
    async endSession() {
      await send({ type: 'endSession' });
    },
    openSession(onEvent, onGone) {
      const port = browser.tabs.connect(tabId, { name: SESSION_PORT });
      let open = true;
      port.onMessage.addListener((message: unknown) => {
        const event = sessionEventSchema.safeParse(message);
        if (event.success) onEvent(event.data);
      });
      port.onDisconnect.addListener(() => {
        if (!open) return;
        open = false;
        onGone();
      });
      return () => {
        if (!open) return;
        open = false;
        port.disconnect();
      };
    },
    watch({ onLoaded, onClosed }) {
      // A page load goes loading → complete. History changes (an SPA's
      // route, Greenhouse's /confirmation) keep the document: not a load.
      let loading = false;
      const updated = (id: number, change: { status?: string }) => {
        if (id !== tabId) return;
        if (change.status === 'loading') loading = true;
        if (change.status === 'complete' && loading) {
          loading = false;
          onLoaded();
        }
      };
      const removed = (id: number) => {
        if (id === tabId) onClosed();
      };
      browser.tabs.onUpdated.addListener(updated);
      browser.tabs.onRemoved.addListener(removed);
      return () => {
        browser.tabs.onUpdated.removeListener(updated);
        browser.tabs.onRemoved.removeListener(removed);
      };
    },
  };
}
