import type { ProviderStatus } from '@employ-me/core/protocol';
import { healthResult } from '../host/health';
import type { HelperConfig } from '../install/config';
import { silentLogger } from '../log/logger';
import { createProviderRegistry, selectProvider } from '../providers/select';
import type { CliContext } from './commands';

/**
 * Asks each recorded CLI whether it is installed and logged in, the same way
 * the host's `health` does, then stops anything it started (Codex's
 * app-server).
 */
export async function providerStatuses(
  context: CliContext,
  config: Pick<HelperConfig, 'cli' | 'models' | 'workDir'>,
): Promise<ProviderStatus[]> {
  const registry = createProviderRegistry((id) =>
    selectProvider(id, config.cli, context.env, {
      platform: context.platform,
      workDir: config.workDir,
      logger: silentLogger,
      models: config.models,
    }),
  );
  try {
    return (await healthResult(registry, { logFile: '', fakeProvider: false })).providers;
  } finally {
    await registry.close();
  }
}
