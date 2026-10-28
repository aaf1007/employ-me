import { doctor, setup, uninstall, type CliIo, type Command } from './commands';

const COMMANDS: Readonly<Record<string, Command>> = { setup, doctor, uninstall };

const USAGE = `Usage: employ-me <command>

Commands:
  setup       Install the helper for your Chromium browsers and find your claude/codex CLIs
  doctor      Check the helper, your CLIs and their logins
  uninstall   Remove everything setup installed`;

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === '--help' || name === '-h') {
    io.out(USAGE);
    return 0;
  }
  const command = COMMANDS[name];
  if (command === undefined) {
    io.err(`Unknown command: ${name}\n\n${USAGE}`);
    return 2;
  }
  return command(rest, io);
}
