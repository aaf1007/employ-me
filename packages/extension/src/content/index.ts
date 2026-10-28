import { err, ok, type Result } from '@employ-me/core';
import { adapterFor, isConfirmation, postingPageText, readPosting } from '@employ-me/fill';
import { browser, type Browser } from 'wxt/browser';
import {
  contentRequestSchema,
  SESSION_PORT,
  type ContentRequest,
  type Detected,
  type FillAnswer,
  type Pong,
  type SessionEvent,
} from '../messaging/content';
import { FillSession } from './session';

/**
 * The ATS content script: does nothing until the side panel asks. Every
 * frame on an ATS host runs it; only the frame holding the Application Form
 * answers `detect`, `fill` and `feedback`, so the panel needn't know frame ids.
 * On any other site the side panel runs it, frame by frame, only when you
 * click Fill there (the generic fallback, sidepanel/site-access.ts).
 */
export function startContentScript(): void {
  let session: FillSession | null = null;
  let port: Browser.runtime.Port | null = null;

  const emit = (event: SessionEvent) => {
    if (port !== null && !post(port, event).ok) port = null;
  };
  const endSession = () => {
    session?.end();
    session = null;
  };

  browser.runtime.onConnect.addListener((opened) => {
    if (opened.name !== SESSION_PORT || opened.sender?.id !== browser.runtime.id) return;
    // Frames without the form let go, so the panel hears when the form's frame goes away.
    if (formHere() === null) {
      opened.disconnect();
      return;
    }
    port = opened;
    opened.onDisconnect.addListener(() => {
      if (port !== opened) return;
      // The side panel closed, or moved on: the Fill is over.
      port = null;
      endSession();
    });
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    const parsed = contentRequestSchema.safeParse(message);
    if (!parsed.success) return false;
    const request: ContentRequest = parsed.data;
    switch (request.type) {
      case 'ping':
        sendResponse(pong());
        return false;
      case 'detect': {
        const detected = detect();
        if (detected !== null) sendResponse(detected);
        return false;
      }
      case 'fill': {
        if (session === null && formHere() === null) return false;
        session ??= new FillSession(document, emit);
        void session.fill(request).then((result) => {
          sendResponse(answer(result));
        });
        return true;
      }
      case 'feedback': {
        if (session === null) return false;
        void session.replan(request.provider).then((result) => {
          sendResponse(answer(result));
        });
        return true;
      }
      case 'endSession':
        endSession();
        return false;
    }
  });
}

function formHere(): Element | null {
  return adapterFor(new URL(location.href)).findForm(document);
}

function pong(): Pong {
  return {
    type: 'pong',
    ats: adapterFor(new URL(location.href)).ats,
    url: location.href,
    topFrame: isTopFrame(),
  };
}

/** A frame with no ancestors is the tab's top frame (read without the global object). */
function isTopFrame(): boolean {
  return location.ancestorOrigins.length === 0;
}

/** The Application Form in this frame, or the ATS's confirmation. Null when neither is here. */
function detect(): Detected | null {
  const url = new URL(location.href);
  const adapter = adapterFor(url);
  const form = adapter.findForm(document);
  const fieldCount = form === null ? 0 : adapter.extract(form).length;
  const confirmed = adapter.ats !== 'generic' && isConfirmation(document, url, adapter.ats) !== null;
  if (fieldCount === 0 && !confirmed) return null;
  const posting = readPosting(document, url);
  // A company site has no public job API: without JSON-LD, its own text is the Snapshot's description.
  const pageText =
    adapter.ats === 'generic' && posting?.description === undefined ? postingPageText(document, form) : '';
  return {
    type: 'detected',
    ats: adapter.ats,
    url: url.href,
    topFrame: isTopFrame(),
    fieldCount,
    posting,
    confirmed,
    ...(pageText === '' ? {} : { pageText }),
  };
}

function answer(result: Awaited<ReturnType<FillSession['fill']>>): FillAnswer {
  return result.ok ? { type: 'filled', view: result.value } : { type: 'failed', error: result.error };
}

function post(port: Browser.runtime.Port, event: SessionEvent): Result<void, { reason: 'portClosed' }> {
  try {
    port.postMessage(event);
    return ok(undefined);
  } catch (error) {
    if (error instanceof Error) return err({ reason: 'portClosed' });
    throw error;
  }
}
