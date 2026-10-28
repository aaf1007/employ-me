import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { browserTargets, manifestPathIn } from '../install/browsers';
import { readHelperConfig } from '../install/config';
import { errorCode } from '../install/install';
import { CONFIG_ENV, installLayout, installRoot } from '../install/layout';
import { regDeleteArgs, regQueryArgs, runReg } from '../install/windows-registry';
import { helperLogFile } from '../log/paths';
import { MARK, parseFlags, type Command } from './commands';

/**
 * `employ-me uninstall`: removes every host manifest (and registry key) and
 * the install folder that setup wrote. Also looks in every browser's usual
 * place, in case the config is gone. The log is kept and its path printed.
 */
export const uninstall: Command = async (args, io, context) => {
  const flags = parseFlags(args, {});
  if (!flags.ok) {
    io.err(`${flags.error}\n\nUsage: employ-me uninstall`);
    return 2;
  }
  const { platform, home, env } = context;
  const layout = installLayout(platform, installRoot(platform, home, env));
  const config = await readHelperConfig(env[CONFIG_ENV] ?? layout.configFile);
  const recorded = config.ok ? config.value.installed : { manifests: [], registryKeys: [] };
  const targets = browserTargets(platform, home, env);
  let failed = false;

  const manifests = new Set([
    ...recorded.manifests.map((manifest) => manifest.path),
    ...targets.flatMap((target) => (target.hostsDir === undefined ? [] : [manifestPathIn(target.hostsDir)])),
  ]);
  for (const path of manifests) {
    if (!existsSync(path)) continue;
    try {
      await rm(path, { force: true });
      io.out(`${MARK.ok} Removed ${path}`);
    } catch (error) {
      failed = true;
      io.err(`${MARK.bad} Couldn't remove ${path} (${errorCode(error)})`);
    }
  }

  const keys = new Set([
    ...recorded.registryKeys.map((entry) => entry.key),
    ...targets.flatMap((target) => (target.registryKey === undefined ? [] : [target.registryKey])),
  ]);
  for (const key of keys) {
    if (!(await runReg(regQueryArgs(key))).ok) continue;
    const removed = await runReg(regDeleteArgs(key));
    if (removed.ok) io.out(`${MARK.ok} Removed ${key}`);
    else {
      failed = true;
      io.err(`${MARK.bad} Couldn't remove ${key}`);
    }
  }

  if (existsSync(layout.root)) {
    await rm(layout.root, { recursive: true, force: true });
    io.out(`${MARK.ok} Removed ${layout.root}`);
  }
  io.out('');
  io.out('Also remove employ-me from your browser: open chrome://extensions and click Remove on its card.');
  io.out(`The log was kept: ${helperLogFile(platform, home, env)}`);
  return failed ? 1 : 0;
};
