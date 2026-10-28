import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FAKE_PROVIDER_ENV, err, ok, type HelperErrorReason, type Result } from '@employ-me/core/protocol';
import { manifestPathIn } from './browsers';
import { writeHelperConfig } from './config';
import { CONFIG_ENV, LOG_FILE_ENV } from './layout';
import { launcherScript } from './launcher';
import { hostManifest } from './manifest';
import { HELPER_VERSION } from '../version';

export interface TestHostOptions {
  /** The Playwright Chromium user-data-dir. Must exist; the context must not have started yet. */
  readonly userDataDir: string;
  /** A helper build (packages/helper/dist). Build it first: `pnpm --filter employ-me build`. */
  readonly helperDist: string;
  /** Absolute node path for the launcher. */
  readonly nodePath: string;
  /** Makes every fake call fail with this reason (EMPLOY_ME_FAKE_FAIL). */
  readonly failWith?: HelperErrorReason;
}

export interface TestHost {
  readonly manifestPath: string;
  /** The test host logs here, not to the user's real log. */
  readonly logFile: string;
}

/**
 * Installs the real helper, with the fake Provider forced on, into a
 * Chromium user-data-dir: Chromium on macOS and Linux also reads host
 * manifests from `<user-data-dir>/NativeMessagingHosts/`. Lets extension e2e
 * tests talk to the real host without spending anyone's plan. Nothing is
 * written outside `userDataDir`. See CLAUDE.md "End-to-end tests".
 */
export async function installTestHost(options: TestHostOptions): Promise<Result<TestHost, string>> {
  if (process.platform === 'win32') {
    return err(
      'Chromium on Windows finds hosts only through the registry, so the test host is macOS and Linux only.',
    );
  }
  const hostScript = join(options.helperDist, 'host.mjs');
  try {
    await access(hostScript);
  } catch {
    return err(`No helper build at ${hostScript}. Run \`pnpm --filter employ-me build\` first.`);
  }
  const dir = join(options.userDataDir, 'employ-me-test-host');
  const configFile = join(dir, 'config.json');
  const logFile = join(dir, 'helper.log');
  const launcher = join(dir, 'launcher.sh');
  const hostsDir = join(options.userDataDir, 'NativeMessagingHosts');
  await mkdir(join(dir, 'work'), { recursive: true });
  await mkdir(hostsDir, { recursive: true });
  await writeHelperConfig(configFile, {
    configVersion: 1,
    helperVersion: HELPER_VERSION,
    cli: {},
    models: {},
    workDir: join(dir, 'work'),
    installed: { manifests: [], registryKeys: [] },
  });
  const env: Record<string, string> = {
    [CONFIG_ENV]: configFile,
    [LOG_FILE_ENV]: logFile,
    [FAKE_PROVIDER_ENV]: 'fake',
    ...(options.failWith === undefined ? {} : { EMPLOY_ME_FAKE_FAIL: options.failWith }),
  };
  // macOS and Linux share the POSIX launcher.
  await writeFile(launcher, launcherScript('linux', { nodePath: options.nodePath, hostScript, env }));
  await chmod(launcher, 0o755);
  const manifestPath = manifestPathIn(hostsDir);
  await writeFile(manifestPath, JSON.stringify(hostManifest(launcher), null, 2));
  return ok({ manifestPath, logFile });
}
