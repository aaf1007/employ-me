import { EXTENSION_ID, HELPER_HOST_NAME } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { hostManifest } from './manifest';

describe('hostManifest', () => {
  it('whitelists exactly the fixed extension ID (ADR-0001)', () => {
    const manifest = hostManifest('/abs/launcher.sh');
    expect(manifest.name).toBe(HELPER_HOST_NAME);
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID}/`]);
    expect(manifest.type).toBe('stdio');
  });
});
