import { join, win32 } from 'node:path';

export type HelperPlatform = 'darwin' | 'linux' | 'win32';

/** The platforms the helper supports, or null for any other `process.platform`. */
export function asHelperPlatform(platform: string): HelperPlatform | null {
  return platform === 'darwin' || platform === 'linux' || platform === 'win32' ? platform : null;
}

/**
 * Where the helper writes its log. Documented in CLAUDE.md "Logs".
 * - macOS:   ~/Library/Logs/employ-me/helper.log (shows up in Console.app)
 * - Linux:   $XDG_STATE_HOME/employ-me/helper.log, else ~/.local/state/employ-me/helper.log
 * - Windows: %LOCALAPPDATA%\employ-me\Logs\helper.log
 */
export function helperLogFile(
  platform: HelperPlatform,
  home: string,
  env: Readonly<Record<string, string | undefined>>,
): string {
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Logs', 'employ-me', 'helper.log');
    case 'linux':
      return join(
        nonEmpty(env['XDG_STATE_HOME']) ?? join(home, '.local', 'state'),
        'employ-me',
        'helper.log',
      );
    case 'win32':
      return win32.join(
        nonEmpty(env['LOCALAPPDATA']) ?? win32.join(home, 'AppData', 'Local'),
        'employ-me',
        'Logs',
        'helper.log',
      );
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
