import { HELPER_ERROR_FIXES } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { disconnectError } from './native-transport';

describe("Chrome's reasons for closing the native port", () => {
  it.each([
    ['Specified native messaging host not found.', 'helperNotInstalled'],
    ['Access to the specified native messaging host is forbidden.', 'helperNotInstalled'],
    ['Failed to start native messaging host.', 'helperNotInstalled'],
    ['Native host has exited.', 'helperDisconnected'],
    ['Error when communicating with the native messaging host.', 'helperDisconnected'],
    [undefined, 'helperDisconnected'],
  ] as const)('%s → %s, with its fix', (chrome, reason) => {
    const error = disconnectError(chrome);
    expect(error.reason).toBe(reason);
    expect(error.fix).toBe(HELPER_ERROR_FIXES[reason]);
    if (chrome !== undefined) expect(error.message).toContain(chrome);
  });
});
