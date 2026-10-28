import { EXTENSION_ID } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { EXTENSION_KEY } from './manifest-key';

// Chrome derives an extension's ID from its public key: SHA-256 of the DER
// bytes, first 32 hex digits, each digit 0-f mapped to a-p.
async function extensionIdFromKey(base64Key: string): Promise<string> {
  const der = Uint8Array.from(atob(base64Key), (char) => char.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return Array.from(hex, (digit) => String.fromCharCode(97 + parseInt(digit, 16))).join('');
}

describe('manifest key', () => {
  it('pins the extension ID the helper whitelists', async () => {
    expect(await extensionIdFromKey(EXTENSION_KEY)).toBe(EXTENSION_ID);
  });
});
