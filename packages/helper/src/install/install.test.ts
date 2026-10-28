import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ok } from '@employ-me/core/protocol';
import { describe, expect, it } from 'vitest';
import { readHelperConfig } from './config';
import { installHelper } from './install';
import { installLayout } from './layout';
import { EXTENSION_ORIGIN, hostManifestSchema } from './manifest';
import { installTestHost } from './test-host';

const tmp = () => mkdtempSync(join(tmpdir(), 'employ-me-install-test-'));

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

  it('runs the real CLIs, without the fake Provider, for the live harness', async () => {
    const userDataDir = tmp();
    const dist = tmp();
    writeFileSync(join(dist, 'host.mjs'), '');
    const host = await installTestHost({
      userDataDir,
      helperDist: dist,
      nodePath: '/usr/local/bin/node',
      realCli: { claude: '/home/sam/.local/bin/claude' },
    });
    expect(host.ok).toBe(true);
    const dir = join(userDataDir, 'employ-me-test-host');
    expect(readFileSync(join(dir, 'launcher.sh'), 'utf8')).not.toContain('EMPLOY_ME_PROVIDER');
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).toMatchObject({
      cli: { claude: '/home/sam/.local/bin/claude' },
    });
  });

  it('says to build the helper first when there is no build', async () => {
    const host = await installTestHost({ userDataDir: tmp(), helperDist: tmp(), nodePath: '/node' });
    expect(host).toMatchObject({
      ok: false,
      error: expect.stringContaining('pnpm --filter employ-me build') as unknown,
    });
  });
});
