import { HELPER_VERSION } from '../version';
import type { CliContext, CliIo, Command } from './commands';
import { doctor } from './doctor';
import { setup } from './setup';
import { installTestHostCommand } from './test-host';
import { uninstall } from './uninstall';

const COMMANDS: Readonly<Record<string, Command>> = {
  setup,
  doctor,
  uninstall,
  'install-test-host': installTestHostCommand,
};

const USAGE = `Usage: employ-me <command>

Commands:
  setup       Install the helper for your Chromium browsers and find your claude/codex CLIs
  doctor      Check the helper, your CLIs and their logins
  uninstall   Remove everything setup installed

For development:
  install-test-host   Put a fake-Provider host in a Chromium user-data-dir, for e2e tests

Run \`employ-me setup --help\` for setup's options.`;

export async function main(argv: readonly string[], io: CliIo, context: CliContext): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === '--help' || name === '-h') {
    io.out(USAGE);
    return 0;
  }
  if (name === '--version' || name === '-v') {
    io.out(HELPER_VERSION);
    return 0;
  }
  const command = COMMANDS[name];
  if (command === undefined) {
    io.err(`Unknown command: ${name}\n\n${USAGE}`);
    return 2;
  }
  return command(rest, io, context);
}
