import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTENSION_KEY } from '../../test/extension-key';
import { STUB_CLAUDE, STUB_CODEX } from '../../test/stub-cli';
import { browserTargets, manifestPathIn } from '../install/browsers';
import { installLayout, installRoot } from '../install/layout';
import { asHelperPlatform } from '../log/paths';
import { HELPER_VERSION } from '../version';
import type { CliContext } from './commands';
import { main } from './main';

const platform = asHelperPlatform(process.platform) ?? 'linux';
const posix = platform !== 'win32';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

/** A fresh home with Chrome "installed", a helper build and a built extension. */
function machine(extensionKey = EXTENSION_KEY) {
  const home = mkdtempSync(join(tmpdir(), 'employ-me-cli-test-'));
  const helperDist = join(home, 'build', 'dist');
  const extension = join(home, 'build', 'extension');
  mkdirSync(helperDist, { recursive: true });
  mkdirSync(extension, { recursive: true });
  writeFileSync(join(helperDist, 'host.mjs'), '');
  writeFileSync(join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, key: extensionKey }));
  // Only PATH: XDG_* or LOCALAPPDATA from the test runner would point outside this home.
  const env = { PATH: process.env['PATH'] };
  const chrome = browserTargets(platform, home, env).find((target) => target.browser === 'chrome');
  if (chrome !== undefined) mkdirSync(chrome.userDataDir, { recursive: true });
  const context: CliContext = { platform, home, env, nodePath: process.execPath, helperDist };
  const layout = installLayout(platform, installRoot(platform, home, env));
  const setupArgs = ['setup', '--extension', extension, '--claude', STUB_CLAUDE, '--codex', STUB_CODEX];
  return { home, context, layout, chrome, setupArgs };
}

describe('employ-me CLI', () => {
  it('prints usage with no command, and the version', async () => {
    const { io, out } = capture();
    expect(await main([], io, machine().context)).toBe(0);
    expect(await main(['--version'], io, machine().context)).toBe(0);
    expect(out.join('\n')).toContain('setup');
    expect(out).toContain(HELPER_VERSION);
  });

  it('rejects unknown commands and flags with exit code 2', async () => {
    const { io, err } = capture();
    expect(await main(['frobnicate'], io, machine().context)).toBe(2);
    expect(await main(['setup', '--frobnicate'], io, machine().context)).toBe(2);
    expect(err.join('\n')).toContain('Unknown command: frobnicate');
  });
});

describe.runIf(posix)('setup, doctor and uninstall', () => {
  it('installs, checks out healthy, and removes everything again', async () => {
    const { context, layout, chrome, setupArgs } = machine();
    const setup = capture();
    expect(await main(setupArgs, setup.io, context)).toBe(0);
    const printed = setup.out.join('\n');
    expect(printed).toContain('Load unpacked');
    expect(printed).toContain(layout.extensionDir);
    expect(printed).toMatch(/✓ claude 2\.1\.311 .*: ready/);
    expect(printed).toMatch(/✓ codex 0\.158\.0 .*: ready/);
    expect(printed).toContain("uses your plan's limits");
    const manifest = manifestPathIn(chrome?.hostsDir ?? '');
    expect(existsSync(manifest)).toBe(true);

    const doctor = capture();
    expect(await main(['doctor'], doctor.io, context)).toBe(0);
    expect(doctor.out.join('\n')).not.toContain('✗');
    expect(doctor.out.join('\n')).toContain('usage left: 88% of the 5-hour window');

    const uninstall = capture();
    expect(await main(['uninstall'], uninstall.io, context)).toBe(0);
    expect(existsSync(manifest)).toBe(false);
    expect(existsSync(layout.root)).toBe(false);
  });

  it('has doctor point at a host manifest that no longer whitelists the extension', async () => {
    const { context, chrome, setupArgs } = machine();
    await main(setupArgs, capture().io, context);
    const manifest = manifestPathIn(chrome?.hostsDir ?? '');
    writeFileSync(
      manifest,
      JSON.stringify({
        name: 'com.employ_me.helper',
        description: '',
        path: '/x',
        type: 'stdio',
        allowed_origins: [],
      }),
    );
    const doctor = capture();
    expect(await main(['doctor'], doctor.io, context)).toBe(1);
    expect(doctor.out.join('\n')).toMatch(/✗ Google Chrome: the host manifest is wrong .*allowed_origins/);
  });

  it('refuses an extension built without the fixed key', async () => {
    const { context, setupArgs } = machine('AAAA');
    const setup = capture();
    expect(await main(setupArgs, setup.io, context)).toBe(1);
    expect(setup.err.join('\n')).toContain("wasn't built with employ-me's fixed key");
  });

  it('tells doctor users to run setup first', async () => {
    const doctor = capture();
    expect(await main(['doctor'], doctor.io, machine().context)).toBe(1);
    expect(doctor.out.join('\n')).toContain('Not set up');
  });
});
