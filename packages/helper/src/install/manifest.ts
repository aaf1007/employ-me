import { EXTENSION_ID, HELPER_HOST_NAME } from '@employ-me/core/protocol';
import type { HelperPlatform } from '../log/paths';

/** Chrome's Native Messaging host manifest. */
export interface HostManifest {
  readonly name: string;
  readonly description: string;
  /** Absolute path to the launcher script that runs dist/host.js with an absolute node path. */
  readonly path: string;
  readonly type: 'stdio';
  readonly allowed_origins: readonly string[];
}

export function hostManifest(launcherPath: string): HostManifest {
  return {
    name: HELPER_HOST_NAME,
    description: 'employ-me helper: runs your own claude/codex CLI for the employ-me extension',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  };
}

export const BROWSERS = ['chrome', 'chromium', 'edge', 'brave', 'arc', 'vivaldi'] as const;
export type Browser = (typeof BROWSERS)[number];

/**
 * Per-user NativeMessagingHosts directory for each Chromium browser
 * (research §3.3). On Windows, hosts are registered under
 * HKCU\Software\<vendor>\NativeMessagingHosts\<name> instead.
 */
export function nativeHostDirs(_platform: HelperPlatform, _home: string): Partial<Record<Browser, string>> {
  throw new Error('not implemented');
}
