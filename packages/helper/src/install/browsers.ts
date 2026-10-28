import { join, win32 } from 'node:path';
import { HELPER_HOST_NAME } from '@employ-me/core/protocol';
import type { HelperPlatform } from '../log/paths';
import type { HelperEnv } from './layout';

/** Chromium-family browsers (design.md "Tech": Chrome, Edge, Brave, Arc, Vivaldi). */
export const BROWSERS = ['chrome', 'chromium', 'edge', 'brave', 'arc', 'vivaldi'] as const;
export type Browser = (typeof BROWSERS)[number];

export interface BrowserTarget {
  readonly browser: Browser;
  readonly name: string;
  /** The browser's per-user data folder. It existing is how we tell the browser is installed. */
  readonly userDataDir: string;
  /** macOS and Linux: the folder the host manifest goes in. */
  readonly hostsDir?: string;
  /** Windows: the HKCU key whose default value is the manifest's path. */
  readonly registryKey?: string;
  /** Where "Load unpacked" lives. */
  readonly extensionsPage: string;
}

interface BrowserSpec {
  readonly name: string;
  readonly page: string;
  readonly mac?: readonly string[];
  readonly linux?: readonly string[];
  /** Under %LOCALAPPDATA%, and the vendor path under HKCU\Software. */
  readonly windows?: { readonly data: readonly string[]; readonly vendor: string };
}

// Per-user locations (research §3.3). Arc has no Linux build and no
// documented Windows host location, so it is macOS only.
const SPECS: Readonly<Record<Browser, BrowserSpec>> = {
  chrome: {
    name: 'Google Chrome',
    page: 'chrome://extensions',
    mac: ['Google', 'Chrome'],
    linux: ['google-chrome'],
    windows: { data: ['Google', 'Chrome', 'User Data'], vendor: 'Google\\Chrome' },
  },
  chromium: {
    name: 'Chromium',
    page: 'chrome://extensions',
    mac: ['Chromium'],
    linux: ['chromium'],
    windows: { data: ['Chromium', 'User Data'], vendor: 'Chromium' },
  },
  edge: {
    name: 'Microsoft Edge',
    page: 'edge://extensions',
    mac: ['Microsoft Edge'],
    linux: ['microsoft-edge'],
    windows: { data: ['Microsoft', 'Edge', 'User Data'], vendor: 'Microsoft\\Edge' },
  },
  brave: {
    name: 'Brave',
    page: 'brave://extensions',
    mac: ['BraveSoftware', 'Brave-Browser'],
    linux: ['BraveSoftware', 'Brave-Browser'],
    windows: {
      data: ['BraveSoftware', 'Brave-Browser', 'User Data'],
      vendor: 'BraveSoftware\\Brave-Browser',
    },
  },
  arc: { name: 'Arc', page: 'arc://extensions', mac: ['Arc', 'User Data'] },
  vivaldi: {
    name: 'Vivaldi',
    page: 'vivaldi://extensions',
    mac: ['Vivaldi'],
    linux: ['vivaldi'],
    windows: { data: ['Vivaldi', 'User Data'], vendor: 'Vivaldi' },
  },
};

/** Every browser we know how to install for on this platform, installed or not. */
export function browserTargets(platform: HelperPlatform, home: string, env: HelperEnv): BrowserTarget[] {
  return BROWSERS.flatMap((browser): BrowserTarget[] => {
    const spec = SPECS[browser];
    const base = { browser, name: spec.name, extensionsPage: spec.page };
    switch (platform) {
      case 'darwin': {
        if (spec.mac === undefined) return [];
        const userDataDir = join(home, 'Library', 'Application Support', ...spec.mac);
        return [{ ...base, userDataDir, hostsDir: join(userDataDir, 'NativeMessagingHosts') }];
      }
      case 'linux': {
        if (spec.linux === undefined) return [];
        const config = nonEmpty(env['XDG_CONFIG_HOME']) ?? join(home, '.config');
        const userDataDir = join(config, ...spec.linux);
        return [{ ...base, userDataDir, hostsDir: join(userDataDir, 'NativeMessagingHosts') }];
      }
      case 'win32': {
        if (spec.windows === undefined) return [];
        const local = nonEmpty(env['LOCALAPPDATA']) ?? win32.join(home, 'AppData', 'Local');
        const registryKey = `HKCU\\Software\\${spec.windows.vendor}\\NativeMessagingHosts\\${HELPER_HOST_NAME}`;
        return [{ ...base, userDataDir: win32.join(local, ...spec.windows.data), registryKey }];
      }
    }
  });
}

/** The installed browsers, plus Chrome even if it has never run, so a later first launch finds the host. */
export function browsersToInstall(
  targets: readonly BrowserTarget[],
  exists: (path: string) => boolean,
): BrowserTarget[] {
  return targets.filter((target) => target.browser === 'chrome' || exists(target.userDataDir));
}

export function manifestPathIn(hostsDir: string): string {
  return join(hostsDir, `${HELPER_HOST_NAME}.json`);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
