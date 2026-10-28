import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HELPER_VERSION } from '../version';
import type { HelperPlatform } from '../log/paths';
import { manifestPathIn, type Browser, type BrowserTarget } from './browsers';
import { writeHelperConfig, type HelperConfig } from './config';
import { CONFIG_ENV, type InstallLayout } from './layout';
import { launcherScript } from './launcher';
import { hostManifest } from './manifest';
import { regAddArgs, type RegRunner } from './windows-registry';

export interface InstallPlan {
  readonly platform: HelperPlatform;
  readonly layout: InstallLayout;
  readonly nodePath: string;
  /** The helper build to copy (dist/). */
  readonly helperDist: string;
  /** The built extension to copy for "Load unpacked", if there is one. */
  readonly extensionSource: string | null;
  readonly cli: HelperConfig['cli'];
  readonly models: HelperConfig['models'];
  readonly targets: readonly BrowserTarget[];
  readonly reg: RegRunner;
}

export interface InstallReport {
  readonly manifests: { readonly browser: Browser; readonly path: string }[];
  readonly registryKeys: { readonly browser: Browser; readonly key: string }[];
  readonly failures: { readonly browser: Browser; readonly why: string }[];
}

/**
 * Writes everything `employ-me setup` installs: a stable copy of the helper
 * and the extension, the launcher, the config, and one host manifest per
 * browser (a registry key per browser on Windows). Safe to re-run: each
 * run replaces the last.
 */
export async function installHelper(plan: InstallPlan): Promise<InstallReport> {
  const { layout } = plan;
  await mkdir(layout.root, { recursive: true });
  // Re-running setup from the installed copy must not delete its own source.
  if (resolve(plan.helperDist) !== resolve(layout.helperDir)) {
    await rm(layout.helperDir, { recursive: true, force: true });
    await cp(plan.helperDist, layout.helperDir, { recursive: true });
  }
  if (plan.extensionSource !== null && resolve(plan.extensionSource) !== resolve(layout.extensionDir)) {
    await rm(layout.extensionDir, { recursive: true, force: true });
    await cp(plan.extensionSource, layout.extensionDir, { recursive: true });
  }
  await mkdir(layout.workDir, { recursive: true });
  await writeFile(
    layout.launcher,
    launcherScript(plan.platform, {
      nodePath: plan.nodePath,
      hostScript: layout.hostScript,
      env: { [CONFIG_ENV]: layout.configFile },
    }),
  );
  await chmod(layout.launcher, 0o755);

  const report = await writeManifests(plan);
  await writeHelperConfig(layout.configFile, {
    configVersion: 1,
    helperVersion: HELPER_VERSION,
    nodePath: plan.nodePath,
    cli: plan.cli,
    models: plan.models,
    workDir: layout.workDir,
    installed: { manifests: report.manifests, registryKeys: report.registryKeys },
  });
  return report;
}

async function writeManifests(plan: InstallPlan): Promise<InstallReport> {
  const manifest = `${JSON.stringify(hostManifest(plan.layout.launcher), null, 2)}\n`;
  const report: InstallReport = { manifests: [], registryKeys: [], failures: [] };
  if (plan.targets.some((target) => target.registryKey !== undefined)) {
    await writeFile(plan.layout.manifestFile, manifest);
  }
  for (const target of plan.targets) {
    if (target.hostsDir !== undefined) {
      const path = manifestPathIn(target.hostsDir);
      try {
        await mkdir(target.hostsDir, { recursive: true });
        await writeFile(path, manifest);
        report.manifests.push({ browser: target.browser, path });
      } catch (error) {
        report.failures.push({
          browser: target.browser,
          why: `couldn't write ${path} (${errorCode(error)})`,
        });
      }
    }
    if (target.registryKey !== undefined) {
      const added = await plan.reg(regAddArgs(target.registryKey, plan.layout.manifestFile));
      if (added.ok) report.registryKeys.push({ browser: target.browser, key: target.registryKey });
      else report.failures.push({ browser: target.browser, why: `reg add ${target.registryKey} failed` });
    }
  }
  return report;
}

export function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'error';
}
