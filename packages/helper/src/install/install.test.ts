import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXTENSION_ID, ok } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { browserTargets, browsersToInstall } from './browsers';
import { readHelperConfig } from './config';
import { extensionIdFromKey } from './extension-id';
import { findCli } from './find-cli';
import { installHelper } from './install';
import { installLayout } from './layout';
import { launcherScript } from './launcher';
import { EXTENSION_ORIGIN, hostManifestSchema } from './manifest';
import { EXTENSION_KEY } from '../../test/extension-key';
import { installTestHost } from './test-host';

const tmp = () => mkdtempSync(join(tmpdir(), 'employ-me-install-test-'));

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

describe('installHelper', () => {
  it('writes the helper, extension, launcher, config and a manifest per browser', async () => {
    const root = tmp();
    const dist = join(root, 'dist');
    const extension = join(root, 'ext');
    mkdirSync(dist);
    mkdirSync(extension);
    writeFileSync(join(dist, 'host.mjs'), '');
    writeFileSync(join(extension, 'manifest.json'), '{}');
    const layout = installLayout('darwin', join(root, 'install'));
    const hostsDir = join(root, 'Chrome', 'NativeMessagingHosts');
    const report = await installHelper({
      platform: 'darwin',
      layout,
      nodePath: '/usr/local/bin/node',
      helperDist: dist,
      extensionSource: extension,
      cli: { claude: '/home/sam/.local/bin/claude' },
      models: {},
      targets: [
        { browser: 'chrome', name: 'Google Chrome', userDataDir: root, hostsDir, extensionsPage: '' },
      ],
      reg: () => Promise.resolve(ok('')),
    });

    expect(report.failures).toEqual([]);
    const manifest = hostManifestSchema.parse(
      JSON.parse(readFileSync(join(hostsDir, 'com.employ_me.helper.json'), 'utf8')),
    );
    expect(manifest).toMatchObject({
      path: layout.launcher,
      type: 'stdio',
      allowed_origins: [EXTENSION_ORIGIN],
    });
    expect(statSync(layout.launcher).mode & 0o111).not.toBe(0);
    expect(readFileSync(layout.launcher, 'utf8')).toContain(`'/usr/local/bin/node' '${layout.hostScript}'`);
    expect(statSync(layout.hostScript).isFile()).toBe(true);
    expect(statSync(join(layout.extensionDir, 'manifest.json')).isFile()).toBe(true);
    const config = await readHelperConfig(layout.configFile);
    expect(config.ok && config.value).toMatchObject({
      cli: { claude: '/home/sam/.local/bin/claude' },
      installed: { manifests: [{ browser: 'chrome' }] },
    });
  });

  it('registers each browser with reg.exe on Windows', async () => {
    const calls: (readonly string[])[] = [];
    const root = tmp();
    mkdirSync(join(root, 'dist'));
    // Windows file names, but in a real folder on this machine: a win32
    // layout of a POSIX temp path would be a relative path into the repo.
    const posix = installLayout('linux', join(root, 'install'));
    const layout = { ...posix, launcher: join(posix.root, 'launcher.cmd') };
    await installHelper({
      platform: 'win32',
      layout,
      nodePath: 'C:\\node.exe',
      helperDist: join(root, 'dist'),
      extensionSource: null,
      cli: {},
      models: {},
      targets: [
        { browser: 'chrome', name: 'Chrome', userDataDir: root, registryKey: 'HKCU\\K', extensionsPage: '' },
      ],
      reg: (args) => {
        calls.push(args);
        return Promise.resolve(ok(''));
      },
    });
    expect(calls).toEqual([['add', 'HKCU\\K', '/ve', '/t', 'REG_SZ', '/d', layout.manifestFile, '/f']]);
  });
});

describe('installTestHost', () => {
  it('puts a fake-Provider host in the user-data-dir and nowhere else', async () => {
    const userDataDir = tmp();
    const dist = tmp();
    writeFileSync(join(dist, 'host.mjs'), '');
    const host = await installTestHost({ userDataDir, helperDist: dist, nodePath: '/usr/local/bin/node' });
    expect(host).toMatchObject({
      ok: true,
      value: { manifestPath: join(userDataDir, 'NativeMessagingHosts', 'com.employ_me.helper.json') },
    });
    const manifest = hostManifestSchema.parse(
      JSON.parse(
        readFileSync(join(userDataDir, 'NativeMessagingHosts', 'com.employ_me.helper.json'), 'utf8'),
      ),
    );
    expect(manifest.path.startsWith(userDataDir)).toBe(true);
    const launcher = readFileSync(manifest.path, 'utf8');
    expect(launcher).toContain("EMPLOY_ME_PROVIDER='fake'");
    expect(launcher).toContain(
      `EMPLOY_ME_LOG_FILE='${join(userDataDir, 'employ-me-test-host', 'helper.log')}'`,
    );
  });

  it('says to build the helper first when there is no build', async () => {
    const host = await installTestHost({ userDataDir: tmp(), helperDist: tmp(), nodePath: '/node' });
    expect(host).toMatchObject({
      ok: false,
      error: expect.stringContaining('pnpm --filter employ-me build') as unknown,
    });
  });
});
