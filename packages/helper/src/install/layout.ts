import { join, win32 } from 'node:path';
import type { HelperPlatform } from '../log/paths';

export type HelperEnv = Readonly<Record<string, string | undefined>>;

/**
 * Where `employ-me setup` installs. A stable folder, not the npx cache:
 * Chrome's host manifest and the unpacked extension must survive cache
 * cleanups and upgrades.
 * - macOS:   ~/Library/Application Support/employ-me
 * - Linux:   $XDG_DATA_HOME/employ-me, else ~/.local/share/employ-me
 * - Windows: %LOCALAPPDATA%\employ-me
 */
export function installRoot(platform: HelperPlatform, home: string, env: HelperEnv): string {
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'employ-me');
    case 'linux':
      return join(nonEmpty(env['XDG_DATA_HOME']) ?? join(home, '.local', 'share'), 'employ-me');
    case 'win32':
      return win32.join(nonEmpty(env['LOCALAPPDATA']) ?? win32.join(home, 'AppData', 'Local'), 'employ-me');
  }
}

export interface InstallLayout {
  readonly root: string;
  /** A copy of the helper's dist/ (host.mjs and its chunks). */
  readonly helperDir: string;
  readonly hostScript: string;
  /** The unpacked extension, for "Load unpacked". */
  readonly extensionDir: string;
  readonly configFile: string;
  /** What Chrome runs. Holds absolute paths to node and host.mjs (Chrome from the Dock has no PATH). */
  readonly launcher: string;
  /** Windows keeps the host manifest here; the registry points at it. */
  readonly manifestFile: string;
  /** An empty folder the CLIs run in, so no project's CLAUDE.md or AGENTS.md is picked up. */
  readonly workDir: string;
}

export function installLayout(platform: HelperPlatform, root: string): InstallLayout {
  const path = platform === 'win32' ? win32 : { join };
  return {
    root,
    helperDir: path.join(root, 'helper'),
    hostScript: path.join(root, 'helper', 'host.mjs'),
    extensionDir: path.join(root, 'extension'),
    configFile: path.join(root, 'config.json'),
    launcher: path.join(root, platform === 'win32' ? 'launcher.cmd' : 'launcher.sh'),
    manifestFile: path.join(root, 'com.employ_me.helper.json'),
    workDir: path.join(root, 'work'),
  };
}

/** Lets the host find its config. Set by the launcher; tests point it elsewhere. */
export const CONFIG_ENV = 'EMPLOY_ME_CONFIG';
/** Overrides the log file, so e2e runs don't write to the user's real log. */
export const LOG_FILE_ENV = 'EMPLOY_ME_LOG_FILE';

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
