/**
 * The extension's ID, fixed by the `key` in packages/extension/wxt.config.ts.
 * The helper's Native Messaging host manifest whitelists exactly this ID
 * (ADR-0001), so it must never change. A unit test in the extension package
 * checks that the key still hashes to this value.
 */
export const EXTENSION_ID = 'ippegianaaknpaknfbjblanhbehckehh';

/** Native Messaging host name. Lowercase, dots and underscores only (Chrome rule). */
export const HELPER_HOST_NAME = 'com.employ_me.helper';

/** Bumped on any breaking change to the helper protocol. */
export const PROTOCOL_VERSION = 1;

/** Chrome's cap on a single message from the host to the extension. */
export const MAX_HELPER_TO_EXTENSION_BYTES = 1024 * 1024;

/** Chrome's cap on a single message from the extension to the host. */
export const MAX_EXTENSION_TO_HELPER_BYTES = 64 * 1024 * 1024;

/** Environment variable that makes the helper use the fake Provider (tests only). */
export const FAKE_PROVIDER_ENV = 'EMPLOY_ME_PROVIDER';
