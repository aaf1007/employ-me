import { browser } from 'wxt/browser';
import { z } from 'zod';
import {
  createHelperClient,
  createInMemoryHelper,
  createNativeTransport,
  type HelperTransport,
} from '../helper';
import { BACKGROUND_ADDRESS } from '../messaging/background';
import { openDataStore, type DataStore } from '../storage';
import { createRouter } from './router';
import { senderKind } from './sender';

const addressedSchema = z.object({ to: z.literal(BACKGROUND_ADDRESS) });

/**
 * Wires the background: one helper client, kept warm across messages, and
 * the message router. Listeners are added synchronously, so a message that
 * wakes the service worker is delivered (research §5).
 */
export function startBackground(): void {
  const helper = createHelperClient(helperTransport());
  let opening: Promise<DataStore> | undefined;
  const store = () => {
    opening ??= openDataStore().catch((error: unknown) => {
      // Let the next message try again rather than keep a failed open.
      opening = undefined;
      throw new Error('Opening the database failed', { cause: error });
    });
    return opening;
  };
  const router = createRouter({ store, helper });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!addressedSchema.safeParse(message).success) return false;
    void router.handle(message, senderKind(sender, browser.runtime.id)).then(sendResponse);
    // Keeps the channel open for the asynchronous answer.
    return true;
  });
}

/**
 * Native Messaging in real builds. `wxt build --mode e2e` swaps in the
 * in-memory helper and exposes it to Playwright as `globalThis.employMeTest`
 * (see e2e/harness.ts). The mode is replaced at build time, so production
 * bundles contain neither.
 */
function helperTransport(): HelperTransport {
  if (import.meta.env.MODE === 'e2e') {
    const inMemory = createInMemoryHelper();
    Object.assign(globalThis, { employMeTest: { helper: inMemory } });
    return inMemory;
  }
  return createNativeTransport();
}
