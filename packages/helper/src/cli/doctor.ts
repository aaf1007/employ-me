import { existsSync } from 'node:fs';
import { browserTargets } from '../install/browsers';
import { readHelperConfig } from '../install/config';
import { CONFIG_ENV, LOG_FILE_ENV, installLayout, installRoot } from '../install/layout';
import { runReg } from '../install/windows-registry';
import { helperLogFile } from '../log/paths';
import { HELPER_VERSION } from '../version';
import { MARK, parseFlags, type Command } from './commands';
import { browserChecks, extensionCheck, helperChecks, type Check } from './doctor-checks';
import { providerLines } from './format';
import { providerStatuses } from './provider-status';

/**
 * `employ-me doctor`: is the helper installed, are the host manifests right,
 * is the extension there, and are the CLIs found and logged in (the same
 * health the side panel shows). Exits 1 when something needs fixing.
 */
export const doctor: Command = async (args, io, context) => {
  const flags = parseFlags(args, {});
  if (!flags.ok) {
    io.err(`${flags.error}\n\nUsage: employ-me doctor`);
    return 2;
  }
  const { platform, home, env } = context;
  const layout = installLayout(platform, installRoot(platform, home, env));
  const configFile = env[CONFIG_ENV] ?? layout.configFile;
  const logFile = env[LOG_FILE_ENV] ?? helperLogFile(platform, home, env);
  io.out(`employ-me doctor (helper ${HELPER_VERSION})`);

  const config = await readHelperConfig(configFile);
  if (!config.ok) {
    const what = config.error.reason === 'missing' ? 'is missing' : "can't be read";
    io.out(`${MARK.bad} Not set up: ${configFile} ${what}. Run \`npx employ-me setup\`.`);
    io.out(`Log: ${logFile}`);
    return 1;
  }

  const failed: Check[] = [];
  const section = (title: string, checks: readonly Check[]) => {
    io.out('');
    io.out(title);
    for (const check of checks) {
      io.out(`  ${check.ok ? MARK.ok : MARK.bad} ${check.text}`);
      if (!check.ok) failed.push(check);
    }
  };
  section('Helper', helperChecks(platform, layout, config.value));
  const targets = browserTargets(platform, home, env).filter(
    (target) =>
      existsSync(target.userDataDir) ||
      config.value.installed.manifests.some((manifest) => manifest.browser === target.browser),
  );
  const browsers = await browserChecks(targets, layout, runReg);
  section('Browsers', browsers.length > 0 ? browsers : [{ ok: false, text: 'No Chromium browser found.' }]);
  section('Extension', [await extensionCheck(layout)]);

  io.out('');
  io.out('AI CLIs');
  const statuses = await providerStatuses(context, config.value);
  for (const line of statuses.flatMap(providerLines)) io.out(line);
  const anyReady = statuses.some((status) => status.state === 'ready' && status.problem === undefined);
  if (!anyReady) io.out(`  ${MARK.bad} Neither claude nor codex is ready, so Fills run on rules only.`);

  io.out('');
  io.out(`Log: ${logFile}`);
  return failed.length === 0 && anyReady ? 0 : 1;
};
