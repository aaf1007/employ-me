import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, win32 } from 'node:path';
import type { ProviderId } from '@employ-me/core/protocol';
import type { HelperPlatform } from '../log/paths';
import type { HelperEnv } from './layout';

export interface FindCliDeps {
  readonly platform: HelperPlatform;
  readonly home: string;
  readonly env: HelperEnv;
  readonly isExecutable?: (path: string) => boolean;
}

/**
 * Finds the absolute path of the user's `claude` or `codex`, the way their
 * shell would, plus the usual install folders that a GUI-launched process
 * misses. Setup records the result because Chrome has no shell PATH
 * (ADR-0001). The symlink is kept as found, so CLI upgrades still resolve.
 */
export function findCli(name: ProviderId, deps: FindCliDeps): string | null {
  const isExecutable = deps.isExecutable ?? defaultIsExecutable;
  for (const dir of searchDirs(deps)) {
    for (const file of fileNames(name, deps)) {
      const candidate = deps.platform === 'win32' ? win32.join(dir, file) : join(dir, file);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function searchDirs({ platform, home, env }: FindCliDeps): string[] {
  const pathDirs = (env['PATH'] ?? env['Path'] ?? '')
    .split(platform === 'win32' ? ';' : delimiter)
    .filter((dir) => dir !== '' && (platform === 'win32' ? win32.isAbsolute(dir) : isAbsolute(dir)));
  const known =
    platform === 'win32'
      ? [
          win32.join(home, '.local', 'bin'),
          ...(env['APPDATA'] === undefined ? [] : [win32.join(env['APPDATA'], 'npm')]),
        ]
      : [
          join(home, '.local', 'bin'),
          join(home, '.claude', 'local'),
          '/opt/homebrew/bin',
          '/usr/local/bin',
          '/usr/bin',
          join(home, '.npm-global', 'bin'),
          join(home, '.bun', 'bin'),
          join(home, '.volta', 'bin'),
          join(home, 'Library', 'pnpm'),
          join(home, '.local', 'share', 'pnpm'),
        ];
  return [...new Set([...pathDirs, ...known])];
}

function fileNames(name: ProviderId, { platform }: FindCliDeps): string[] {
  return platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
}

function defaultIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
