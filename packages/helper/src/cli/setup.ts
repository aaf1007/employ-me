import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { EXTENSION_ID, PROVIDER_IDS } from '@employ-me/core/protocol';
import { browserTargets, browsersToInstall, type BrowserTarget } from '../install/browsers';
import type { HelperConfig } from '../install/config';
import { builtExtensionId } from '../install/extension-id';
import { findCli } from '../install/find-cli';
import { installHelper } from '../install/install';
import { installLayout, installRoot } from '../install/layout';
import { runReg } from '../install/windows-registry';
import { MARK, parseFlags, type CliIo, type Command } from './commands';
import { providerLines } from './format';
import { providerStatuses } from './provider-status';

export const SETUP_USAGE = `Usage: employ-me setup [--extension <folder>] [--claude <path>] [--codex <path>]

  --extension  The built extension to install for "Load unpacked"
               (from a repo checkout: packages/extension/.output/chrome-mv3)
  --claude     Absolute path to claude, if setup can't find it
  --codex      Absolute path to codex, if setup can't find it`;

const FLAGS = {
  extension: { type: 'string' },
  claude: { type: 'string' },
  codex: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

/**
 * `npx employ-me setup` (design.md "Tech"): copies the helper and the
 * extension to a stable folder, records absolute paths to node, claude and
 * codex (Chrome from the Dock has no PATH), writes the launcher and one host
 * manifest per Chromium browser, then prints the "Load unpacked" steps.
 * Never reads Claude or Codex credentials (ADR-0002).
 */
export const setup: Command = async (args, io, context) => {
  const flags = parseFlags(args, FLAGS);
  if (!flags.ok) {
    io.err(`${flags.error}\n\n${SETUP_USAGE}`);
    return 2;
  }
  if (flags.value.help === true) {
    io.out(SETUP_USAGE);
    return 0;
  }
  const { platform, home, env } = context;
  const layout = installLayout(platform, installRoot(platform, home, env));
  if (!existsSync(join(context.helperDist, 'host.mjs'))) {
    io.err(`${MARK.bad} No helper build in ${context.helperDist}. Run \`pnpm build\` first.`);
    return 1;
  }

  const extensionSource = resolve(flags.value.extension ?? join(context.helperDist, '..', 'extension'));
  const extension = await checkExtension(extensionSource);
  if (extension === 'wrongId') {
    io.err(
      `${MARK.bad} The extension in ${extensionSource} wasn't built with employ-me's fixed key, so its ID won't match the helper's (${EXTENSION_ID}). Rebuild it with \`pnpm build\`.`,
    );
    return 1;
  }

  const cli: HelperConfig['cli'] = {};
  for (const id of PROVIDER_IDS) {
    const given = flags.value[id];
    if (given !== undefined && !isAbsolute(given)) {
      io.err(`${MARK.bad} --${id} needs an absolute path.`);
      return 2;
    }
    const found = given ?? findCli(id, { platform, home, env });
    if (found !== null) cli[id] = found;
  }

  const targets = browsersToInstall(browserTargets(platform, home, env), existsSync);
  const report = await installHelper({
    platform,
    layout,
    nodePath: context.nodePath,
    helperDist: context.helperDist,
    extensionSource: extension === 'ok' ? extensionSource : null,
    cli,
    models: {},
    targets,
    reg: runReg,
  });

  io.out(`${MARK.ok} Helper installed in ${layout.root}`);
  const name = (browser: string) => targets.find((target) => target.browser === browser)?.name ?? browser;
  for (const { browser, path } of report.manifests) io.out(`${MARK.ok} ${name(browser)}: ${path}`);
  for (const { browser, key } of report.registryKeys) io.out(`${MARK.ok} ${name(browser)}: ${key}`);
  for (const { browser, why } of report.failures) io.out(`${MARK.bad} ${name(browser)}: ${why}`);
  if (extension === 'missing') {
    io.out(
      `${MARK.bad} No built extension in ${extensionSource}. Pass --extension <folder> (from a repo checkout: packages/extension/.output/chrome-mv3).`,
    );
  }

  io.out('');
  io.out('Your AI CLIs:');
  const statuses = await providerStatuses(context, { cli, models: {}, workDir: layout.workDir });
  for (const line of statuses.flatMap(providerLines)) io.out(line);

  if (extension === 'ok') printLoadUnpacked(io, layout.extensionDir, targets);
  io.out('');
  io.out(
    "employ-me runs your own claude or codex, so it uses your plan's limits. It's meant for personal use.",
  );
  return report.manifests.length + report.registryKeys.length > 0 ? 0 : 1;
};

async function checkExtension(dir: string): Promise<'ok' | 'missing' | 'wrongId'> {
  if (!existsSync(join(dir, 'manifest.json'))) return 'missing';
  return (await builtExtensionId(dir)) === EXTENSION_ID ? 'ok' : 'wrongId';
}

function printLoadUnpacked(io: CliIo, extensionDir: string, targets: readonly BrowserTarget[]): void {
  const pages = [...new Set(targets.map((target) => `${target.extensionsPage} (${target.name})`))];
  io.out('');
  io.out('Next, load the extension once in each browser:');
  io.out(`  1. Open ${pages.join(', or ')}.`);
  io.out('  2. Turn on Developer mode.');
  io.out('  3. Click "Load unpacked" and choose this folder:');
  io.out(`       ${extensionDir}`);
  io.out('  4. Pin employ-me, then click its icon on a job application to open the side panel.');
  io.out('After running setup again, click the reload arrow on the employ-me card.');
}
