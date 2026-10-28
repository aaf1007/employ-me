import type { HelperError, HelperRequest, Result } from '@employ-me/core';

export interface TransportHandlers {
  /** One message from the helper, not yet validated. */
  onMessage(message: unknown): void;
  /** The connection closed from the helper's side, or never opened. Called at most once. */
  onDisconnect(error: HelperError): void;
}

export interface HelperConnection {
  send(message: HelperRequest): Result<void, HelperError>;
  /** Closes from our side. `onDisconnect` is not called for it. */
  close(): void;
}

/**
 * How the extension reaches the helper. The real one is Chrome Native
 * Messaging (native-transport.ts). Test builds swap in an in-memory helper
 * (in-memory-transport.ts), so e2e tests don't wait on the helper package.
 */
export interface HelperTransport {
  open(handlers: TransportHandlers): HelperConnection;
}
