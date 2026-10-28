import { err, HELPER_HOST_NAME, helperError, ok, type HelperError } from '@employ-me/core';
import { browser } from 'wxt/browser';
import type { HelperTransport } from './transport';

/** Chrome Native Messaging to the helper `npx employ-me setup` installed (ADR-0001). */
export function createNativeTransport(): HelperTransport {
  return {
    open(handlers) {
      const port = browser.runtime.connectNative(HELPER_HOST_NAME);
      port.onMessage.addListener((message: unknown) => {
        handlers.onMessage(message);
      });
      port.onDisconnect.addListener(() => {
        handlers.onDisconnect(disconnectError(browser.runtime.lastError?.message));
      });
      return {
        send(message) {
          try {
            port.postMessage(message);
            return ok(undefined);
          } catch (error) {
            return err(
              helperError(
                'helperDisconnected',
                `The connection to the helper had closed: ${error instanceof Error ? error.message : 'unknown error'}`,
              ),
            );
          }
        },
        close() {
          port.disconnect();
        },
      };
    },
  };
}

/**
 * Turns Chrome's reason for closing a native port into a helper error. Chrome
 * reports a missing or misconfigured host only this way: there is no
 * separate "is it installed" call.
 */
export function disconnectError(chromeMessage: string | undefined): HelperError {
  const said = chromeMessage === undefined ? '' : ` Chrome said: "${chromeMessage}"`;
  if (chromeMessage === undefined) {
    return helperError('helperDisconnected', 'The helper closed the connection.');
  }
  if (/not found/i.test(chromeMessage)) {
    return helperError('helperNotInstalled', `The employ-me helper isn't installed.${said}`);
  }
  if (/forbidden/i.test(chromeMessage)) {
    return helperError('helperNotInstalled', `The helper is installed, but not for this extension.${said}`);
  }
  if (/failed to start/i.test(chromeMessage)) {
    return helperError('helperNotInstalled', `Chrome couldn't start the helper.${said}`);
  }
  return helperError('helperDisconnected', `The helper stopped.${said}`);
}
