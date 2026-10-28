import { resolve } from 'node:path';
import { PROVIDER_IDS, helperErrorReasonSchema } from '@employ-me/core/protocol';
import type { HelperConfig } from '../install/config';
import { findCli } from '../install/find-cli';
import { installTestHost } from '../install/test-host';
import { MARK, parseFlags, type Command } from './commands';

const USAGE = `Usage: employ-me install-test-host --user-data-dir <dir> [--fail <reason> | --real]

Installs this helper, with the fake Provider forced on, into a Chromium
user-data-dir, for e2e tests. Writes nothing outside <dir>.

  --real  Run your own claude and codex (found as setup finds them) instead
          of the fake Provider. Spends your plan: for \`pnpm test:live\` only.`;

/** `employ-me install-test-host`: the CLI form of installTestHost, for e2e (CLAUDE.md "End-to-end tests"). */
export const installTestHostCommand: Command = async (args, io, context) => {
  const flags = parseFlags(args, {
    'user-data-dir': { type: 'string' },
    fail: { type: 'string' },
    real: { type: 'boolean' },
  } as const);
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
  const real = flags.value.real === true;
  if (real && fail !== undefined) {
    io.err(`--fail makes the fake Provider fail; it can't go with --real.\n\n${USAGE}`);
    return 2;
  }
  const installed = await installTestHost({
    userDataDir: resolve(dir),
    helperDist: context.helperDist,
    nodePath: context.nodePath,
    ...(fail === undefined ? {} : { failWith: fail.data }),
    ...(real ? { realCli: realCli(context) } : {}),
  });
  if (!installed.ok) {
    io.err(`${MARK.bad} ${installed.error}`);
    return 1;
  }
  io.out(`${MARK.ok} Test host manifest: ${installed.value.manifestPath}`);
  io.out(`${MARK.ok} Test host log: ${installed.value.logFile}`);
  return 0;
};

function realCli({ platform, home, env }: Parameters<Command>[2]): HelperConfig['cli'] {
  return Object.fromEntries(
    PROVIDER_IDS.flatMap((id) => {
      const path = findCli(id, { platform, home, env });
      return path === null ? [] : [[id, path]];
    }),
  );
}
