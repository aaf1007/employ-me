import type { HelperPlatform } from '../log/paths';

export interface SpawnCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly windowsVerbatimArguments: boolean;
}

// cmd.exe metacharacters (the same set cross-spawn escapes).
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * How to start a CLI. On Windows an npm-installed CLI is a `.cmd` shim, which
 * Node only runs through cmd.exe, so the command line is escaped for cmd
 * (twice for the shim's own re-parse), the way cross-spawn does it. Our
 * arguments carry JSON schemas full of quotes, so this matters.
 */
export function spawnCommand(
  platform: HelperPlatform,
  command: string,
  args: readonly string[],
  comSpec = 'cmd.exe',
): SpawnCommand {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(command)) {
    return { file: command, args, windowsVerbatimArguments: false };
  }
  const line = [command.replace(CMD_META, '^$1'), ...args.map(escapeCmdArgument)].join(' ');
  return { file: comSpec, args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
}

function escapeCmdArgument(argument: string): string {
  // Backslashes before a quote, or at the end, are doubled (qntm.org/cmd).
  const quoted = `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`;
  return quoted.replace(CMD_META, '^$1').replace(CMD_META, '^$1');
}
