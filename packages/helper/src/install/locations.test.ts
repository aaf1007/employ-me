import { EXTENSION_ID } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { EXTENSION_KEY } from '../../test/extension-key';
import { browserTargets, browsersToInstall } from './browsers';
import { extensionIdFromKey } from './extension-id';
import { findCli } from './find-cli';
import { launcherScript } from './launcher';

// Where setup looks and writes, per platform (research §3.3), without touching disk.

describe('browser targets', () => {
  it('puts host manifests in each browser folder on macOS and Linux', () => {
    const mac = browserTargets('darwin', '/Users/sam', {});
    expect(mac.find((target) => target.browser === 'chrome')?.hostsDir).toBe(
      '/Users/sam/Library/Application Support/Google/Chrome/NativeMessagingHosts',
    );
    expect(mac.find((target) => target.browser === 'arc')?.hostsDir).toBe(
      '/Users/sam/Library/Application Support/Arc/User Data/NativeMessagingHosts',
    );
    const linux = browserTargets('linux', '/home/sam', { XDG_CONFIG_HOME: '/cfg' });
    expect(linux.find((target) => target.browser === 'brave')?.hostsDir).toBe(
      '/cfg/BraveSoftware/Brave-Browser/NativeMessagingHosts',
    );
    expect(linux.some((target) => target.browser === 'arc')).toBe(false);
  });

  it('registers hosts under HKCU on Windows', () => {
    const edge = browserTargets('win32', 'C:\\Users\\sam', {
      LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local',
    }).find((target) => target.browser === 'edge');
    expect(edge).toMatchObject({
      registryKey: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.employ_me.helper',
      userDataDir: 'C:\\Users\\sam\\AppData\\Local\\Microsoft\\Edge\\User Data',
    });
  });

  it('installs for browsers that exist, and always for Chrome', () => {
    const targets = browserTargets('darwin', '/Users/sam', {});
    const picked = browsersToInstall(targets, (path) => path.includes('Brave'));
    expect(picked.map((target) => target.browser)).toEqual(['chrome', 'brave']);
  });
});

describe('launcher', () => {
  it('runs host.mjs with absolute paths, quoted for sh', () => {
    const script = launcherScript('darwin', {
      nodePath: '/opt/node 24/bin/node',
      hostScript: "/Users/sam/it's/host.mjs",
      env: { EMPLOY_ME_CONFIG: '/c.json' },
    });
    expect(script).toBe(
      [
        '#!/bin/sh',
        '# Written by `employ-me setup`. Chrome runs this with no PATH, so every path is absolute.',
        "EMPLOY_ME_CONFIG='/c.json'",
        'export EMPLOY_ME_CONFIG',
        `exec '/opt/node 24/bin/node' '/Users/sam/it'\\''s/host.mjs' "$@"`,
        '',
      ].join('\n'),
    );
  });

  it('is a .cmd on Windows', () => {
    const script = launcherScript('win32', {
      nodePath: 'C:\\node\\node.exe',
      hostScript: 'C:\\x\\host.mjs',
      env: { EMPLOY_ME_CONFIG: 'C:\\x\\c.json' },
    });
    expect(script).toContain('set "EMPLOY_ME_CONFIG=C:\\x\\c.json"\r\n');
    expect(script).toContain('"C:\\node\\node.exe" "C:\\x\\host.mjs" %*');
  });
});

describe('findCli', () => {
  it('looks on PATH first, then where installers put the CLIs', () => {
    const found = new Set(['/home/sam/.local/bin/claude', '/opt/homebrew/bin/codex', '/usr/bin/codex']);
    const deps = { platform: 'darwin', home: '/home/sam', env: { PATH: '/usr/bin:relative/bin' } } as const;
    expect(findCli('codex', { ...deps, isExecutable: (path) => found.has(path) })).toBe('/usr/bin/codex');
    expect(findCli('claude', { ...deps, isExecutable: (path) => found.has(path) })).toBe(
      '/home/sam/.local/bin/claude',
    );
    expect(findCli('claude', { ...deps, isExecutable: () => false })).toBeNull();
  });

  it('finds .exe and npm .cmd shims on Windows', () => {
    const deps = {
      platform: 'win32',
      home: 'C:\\Users\\sam',
      env: { PATH: 'C:\\tools', APPDATA: 'C:\\AppData' },
    } as const;
    expect(
      findCli('codex', { ...deps, isExecutable: (path) => path === 'C:\\AppData\\npm\\codex.cmd' }),
    ).toBe('C:\\AppData\\npm\\codex.cmd');
  });
});

describe('extensionIdFromKey', () => {
  it("computes Chrome's ID from the manifest key", () => {
    expect(extensionIdFromKey(EXTENSION_KEY)).toBe(EXTENSION_ID);
  });
});
