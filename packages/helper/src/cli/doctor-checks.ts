import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { EXTENSION_ID } from '@employ-me/core/protocol';
import { manifestPathIn, type BrowserTarget } from '../install/browsers';
import type { HelperConfig } from '../install/config';
import { builtExtensionId } from '../install/extension-id';
import { CONFIG_ENV, type InstallLayout } from '../install/layout';
import { launcherScript } from '../install/launcher';
import { hostManifestSchema, manifestProblems } from '../install/manifest';
import type { HelperPlatform } from '../log/paths';
import { parseRegDefault, regQueryArgs, type RegRunner } from '../install/windows-registry';

export interface Check {
  readonly ok: boolean;
  readonly text: string;
}

const SETUP_AGAIN = 'Run `npx employ-me setup` again.';

/** The installed helper: host script, node, and a launcher that matches what setup would write now. */
export function helperChecks(platform: HelperPlatform, layout: InstallLayout, config: HelperConfig): Check[] {
  const nodePath = config.nodePath;
  const checks: Check[] = [
    existsSync(layout.hostScript)
      ? { ok: true, text: `Host: ${layout.hostScript}` }
      : { ok: false, text: `The host script ${layout.hostScript} is missing. ${SETUP_AGAIN}` },
    nodePath !== undefined && existsSync(nodePath)
      ? { ok: true, text: `Node: ${nodePath}` }
      : {
          ok: false,
          text: `The node setup recorded (${nodePath ?? 'none'}) is gone, e.g. after a Node upgrade. ${SETUP_AGAIN}`,
        },
  ];
  const expected =
    nodePath === undefined
      ? null
      : launcherScript(platform, {
          nodePath,
          hostScript: layout.hostScript,
          env: { [CONFIG_ENV]: layout.configFile },
        });
  checks.push(
    expected !== null && readText(layout.launcher) === expected && isExecutable(layout.launcher)
      ? { ok: true, text: `Launcher: ${layout.launcher}` }
      : { ok: false, text: `The launcher ${layout.launcher} is missing or out of date. ${SETUP_AGAIN}` },
  );
  return checks;
}

/** One check per browser that is installed or has our manifest. */
export async function browserChecks(
  targets: readonly BrowserTarget[],
  layout: InstallLayout,
  reg: RegRunner,
): Promise<Check[]> {
  const checks: Check[] = [];
  for (const target of targets) {
    const installed = existsSync(target.userDataDir);
    let manifestPath: string | null = null;
    if (target.hostsDir !== undefined) {
      manifestPath = manifestPathIn(target.hostsDir);
    } else if (target.registryKey !== undefined) {
      const query = await reg(regQueryArgs(target.registryKey));
      manifestPath = query.ok ? parseRegDefault(query.value) : null;
    }
    const present = manifestPath !== null && existsSync(manifestPath);
    if (!present) {
      if (installed)
        checks.push({
          ok: false,
          text: `${target.name}: installed, but has no host manifest. ${SETUP_AGAIN}`,
        });
      continue;
    }
    const problems = manifestProblemsAt(manifestPath ?? '', layout.launcher);
    checks.push(
      problems.length === 0
        ? { ok: true, text: `${target.name}: ${manifestPath ?? ''}` }
        : {
            ok: false,
            text: `${target.name}: the host manifest is wrong (${problems.join('; ')}). ${SETUP_AGAIN}`,
          },
    );
  }
  return checks;
}

export async function extensionCheck(layout: InstallLayout): Promise<Check> {
  const id = await builtExtensionId(layout.extensionDir);
  if (id === null) {
    return {
      ok: false,
      text: `No unpacked extension in ${layout.extensionDir}. Run setup with --extension <folder>.`,
    };
  }
  return id === EXTENSION_ID
    ? { ok: true, text: `Extension: ${layout.extensionDir} (ID ${id})` }
    : {
        ok: false,
        text: `The extension in ${layout.extensionDir} has ID ${id}, not ${EXTENSION_ID}. Rebuild it and run setup again.`,
      };
}

function manifestProblemsAt(path: string, launcher: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(readText(path) ?? '');
  } catch {
    return ['it is not JSON'];
  }
  const manifest = hostManifestSchema.safeParse(json);
  if (!manifest.success) return ['it is not a host manifest'];
  const problems = manifestProblems(manifest.data, launcher);
  return isExecutable(manifest.data.path)
    ? problems
    : [...problems, 'its launcher is missing or not executable'];
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
