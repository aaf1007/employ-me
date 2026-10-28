import { userInfo } from 'node:os';
import { delimiter, dirname, win32 } from 'node:path';
import type { HelperPlatform } from '../log/paths';
import type { ProviderEnv } from './select';

/**
 * The environment a CLI runs in. Chrome started from the Dock or Start menu
 * gives the host almost no PATH (ADR-0001), and an npm-installed CLI is a
 * `#!/usr/bin/env node` script, so the CLI's own folder and the folder of the
 * node running the helper go first on PATH.
 *
 * On macOS, `claude` finds its own login in the Keychain under $USER: with
 * no USER it reports "not logged in". launchd gives GUI apps USER, but if
 * it's missing the helper fills in the account name (a username, not a
 * credential; the CLI does its own Keychain lookup, ADR-0002).
 */
export function cliEnv(
  platform: HelperPlatform,
  env: ProviderEnv,
  cliPath: string,
  nodePath: string | undefined,
  username: () => string = () => userInfo().username,
): NodeJS.ProcessEnv {
  const dir = platform === 'win32' ? win32.dirname : dirname;
  const separator = platform === 'win32' ? ';' : delimiter;
  const key =
    platform === 'win32' && env['PATH'] === undefined && env['Path'] !== undefined ? 'Path' : 'PATH';
  const first = [dir(cliPath), ...(nodePath === undefined ? [] : [dir(nodePath)])];
  const rest = (env[key] ?? '').split(separator).filter((entry) => entry !== '' && !first.includes(entry));
  const user = platform !== 'win32' && env['USER'] === undefined ? { USER: username() } : {};
  return { ...env, ...user, [key]: [...new Set(first), ...rest].join(separator) };
}
