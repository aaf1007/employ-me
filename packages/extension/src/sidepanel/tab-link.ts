import { err, ok, type Result } from '@employ-me/core';
import { browser } from 'wxt/browser';
import { frameProbeSchema, probeFrame } from '../content/probe';
import {
  detectedSchema,
  fillAnswerSchema,
  pongSchema,
  sessionEventSchema,
  SESSION_PORT,
  type ContentError,
  type ContentRequest,
  type Detected,
  type FillView,
  type ProviderFeedbackMessage,
  type SessionEvent,
} from '../messaging/content';
import { originPatterns, reachSite, type ProbedFrame, type SiteReach } from './site-access';

/** The content script as WXT builds it (entrypoints/ats.content.ts). */
export const CONTENT_SCRIPT_FILE = '/content-scripts/ats.js';

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
  /**
   * The tab's address, when Chrome lets employ-me know it: after you clicked
   * its toolbar icon on this page (activeTab), or on a site it may read.
   */
  url(): Promise<string | null>;
  /** True when the content script answers in any frame of the tab. */
  hasContentScript(): Promise<boolean>;
  /**
   * The generic fallback: runs the content script in every frame of the tab
   * employ-me may read. Only after you click Fill on that page.
   */
  reach(): Promise<Result<SiteReach, ContentError>>;
  /**
   * Asks you, in Chrome's own prompt, to let employ-me read these sites.
   * Chrome asks only during a click: call it first thing in the handler.
   */
  allow(origins: readonly string[]): Promise<boolean>;
}

const UNREACHABLE: ContentError = {
  reason: 'noForm',
  message: 'The Application Form did not answer',
  fix: 'Reload the job site’s page, then click Fill again.',
};

export function tabLink(tabId: number): TabLink {
  /** The frames reach() runs the content script in, so detect() can ask each one. */
  let reached: readonly number[] | null = null;
  /** The frame holding the Application Form on a reached site. Requests go only there. */
  let target: number | undefined;

  const send = async (request: ContentRequest, frameId = target): Promise<unknown> => {
    try {
      return await (frameId === undefined
        ? browser.tabs.sendMessage(tabId, request)
        : browser.tabs.sendMessage(tabId, request, { frameId }));
    } catch (error) {
      // No content script in the tab or frame (not a job site we know, or still loading).
      if (error instanceof Error) return undefined;
      throw error;
    }
  };
  const detectIn = async (frameId: number): Promise<{ frameId: number; detected: Detected } | null> => {
    const answer = detectedSchema.safeParse(await send({ type: 'detect' }, frameId));
    return answer.success ? { frameId, detected: answer.data } : null;
  };
  const scripting = {
    async probe(): Promise<readonly ProbedFrame[] | null> {
      try {
        const results = await browser.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: probeFrame,
        });
        return results.flatMap(({ frameId, result }) => {
          const probe = frameProbeSchema.safeParse(result);
          return probe.success ? [{ frameId, ...probe.data }] : [];
        });
      } catch (error) {
        // Chrome may not read the tab's page: no toolbar click on it, or a page no extension may read.
        if (error instanceof Error) return null;
        throw error;
      }
    },
    async answers(frameId: number): Promise<boolean> {
      return pongSchema.safeParse(await send({ type: 'ping' }, frameId)).success;
    },
    async inject(frameIds: readonly number[]): Promise<boolean> {
      try {
        await browser.scripting.executeScript({
          target: { tabId, frameIds: [...frameIds] },
          files: [CONTENT_SCRIPT_FILE],
        });
        return true;
      } catch (error) {
        if (error instanceof Error) return false;
        throw error;
      }
    },
  };
  const fillRequest = async (request: ContentRequest): Promise<Result<FillView, ContentError>> => {
    const answer = fillAnswerSchema.safeParse(await send(request));
    if (!answer.success) return err(UNREACHABLE);
    return answer.data.type === 'filled' ? ok(answer.data.view) : err(answer.data.error);
  };

  return {
    async detect() {
      if (reached !== null) {
        // Each frame of a reached site answers for itself: the one with the most fields holds the form.
        const answers = (await Promise.all(reached.map(detectIn))).filter((a) => a !== null);
        const best = answers.sort((a, b) => b.detected.fieldCount - a.detected.fieldCount)[0];
        if (best !== undefined) {
          target = best.frameId;
          return best.detected;
        }
      }
      // Otherwise the frame holding the form answers on its own, as on a known job site.
      target = undefined;
      const answer = detectedSchema.safeParse(await send({ type: 'detect' }, undefined));
      return answer.success ? answer.data : null;
    },
    fill: (request) => fillRequest(request),
    feedback: (provider) => fillRequest({ type: 'feedback', provider }),
    async endSession() {
      await send({ type: 'endSession' });
    },
    openSession(onEvent, onGone) {
      const port = browser.tabs.connect(tabId, {
        name: SESSION_PORT,
        ...(target === undefined ? {} : { frameId: target }),
      });
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
    async url() {
      const tab = await browser.tabs.get(tabId).then(
        (found) => found,
        (error: unknown) => {
          // The tab closed.
          if (error instanceof Error) return null;
          throw error;
        },
      );
      return tab?.url ?? null;
    },
    async hasContentScript() {
      return pongSchema.safeParse(await send({ type: 'ping' }, undefined)).success;
    },
    async reach() {
      // A new page: the frames and the form's frame are found again.
      reached = null;
      target = undefined;
      const reach = await reachSite(scripting);
      if (reach.ok) reached = reach.value.frameIds;
      return reach;
    },
    allow(origins) {
      return browser.permissions.request({ origins: originPatterns(origins) });
    },
  };
}
