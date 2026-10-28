import { tmpdir } from 'node:os';
import { FAKE_PROVIDER_ENV } from '@employ-me/core/protocol';
import { readHelperConfig } from '../install/config';
import { CONFIG_ENV, LOG_FILE_ENV, installLayout, installRoot } from '../install/layout';
import { createFileLogger } from '../log/logger';
import { helperLogFile, type HelperPlatform } from '../log/paths';
import { createProviderRegistry, selectProvider, type ProviderEnv } from '../providers/select';
import type { HostRuntime } from './run';

/**
 * Everything the host needs, from the config setup wrote. A missing config
 * isn't fatal: the host still answers `health`, and every Provider reports
 * providerNotFound with "run setup" as the fix.
 */
export async function loadHostRuntime(
  platform: HelperPlatform,
  home: string,
  env: ProviderEnv,
  /** The node running the host (the launcher's absolute path). */
  nodePath: string,
  onLogFailure: (error: unknown) => void,
): Promise<HostRuntime> {
  const layout = installLayout(platform, installRoot(platform, home, env));
  const configFile = nonEmpty(env[CONFIG_ENV]) ?? layout.configFile;
  const logFile = nonEmpty(env[LOG_FILE_ENV]) ?? helperLogFile(platform, home, env);
  const logger = createFileLogger(logFile, onLogFailure);
  const config = await readHelperConfig(configFile);
  const cli = config.ok ? config.value.cli : {};
  const context = {
    platform,
    workDir: config.ok ? config.value.workDir : tmpdir(),
    logger,
    nodePath,
    ...(config.ok ? { models: config.value.models } : {}),
  };
  return {
    logger,
    logFile,
    fakeProvider: env[FAKE_PROVIDER_ENV] === 'fake',
    providers: createProviderRegistry((id) => selectProvider(id, cli, env, context)),
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
