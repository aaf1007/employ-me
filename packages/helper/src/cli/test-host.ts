import { resolve } from 'node:path';
import { helperErrorReasonSchema } from '@employ-me/core/protocol';
import { installTestHost } from '../install/test-host';
import { MARK, parseFlags, type Command } from './commands';

const USAGE = `Usage: employ-me install-test-host --user-data-dir <dir> [--fail <reason>]

Installs this helper, with the fake Provider forced on, into a Chromium
user-data-dir, for e2e tests. Writes nothing outside <dir>.`;

/** `employ-me install-test-host`: the CLI form of installTestHost, for e2e (CLAUDE.md "End-to-end tests"). */
export const installTestHostCommand: Command = async (args, io, context) => {
  const flags = parseFlags(args, { 'user-data-dir': { type: 'string' }, fail: { type: 'string' } } as const);
  const dir = flags.ok ? flags.value['user-data-dir'] : undefined;
  if (!flags.ok || dir === undefined) {
    io.err(`${flags.ok ? 'Missing --user-data-dir' : flags.error}\n\n${USAGE}`);
    return 2;
  }
  const fail =
    flags.value.fail === undefined ? undefined : helperErrorReasonSchema.safeParse(flags.value.fail);
  if (fail?.success === false) {
    io.err(`--fail must be a HelperErrorReason, such as providerRateLimited.\n\n${USAGE}`);
    return 2;
  }
  const installed = await installTestHost({
    userDataDir: resolve(dir),
    helperDist: context.helperDist,
    nodePath: context.nodePath,
    ...(fail === undefined ? {} : { failWith: fail.data }),
  });
  if (!installed.ok) {
    io.err(`${MARK.bad} ${installed.error}`);
    return 1;
  }
  io.out(`${MARK.ok} Test host manifest: ${installed.value.manifestPath}`);
  io.out(`${MARK.ok} Test host log: ${installed.value.logFile}`);
  return 0;
};
