import { FAKE_PROVIDER_ENV, helperErrorReasonSchema, type ProviderId } from '@employ-me/core/protocol';
import type { Logger } from '../log/logger';
import type { HelperPlatform } from '../log/paths';
import { createClaudeProvider } from './claude/provider';
import { cliEnv } from './cli-env';
import { createCodexProvider } from './codex/provider';
import { createFakeProvider } from './fake';
import type { HelperProvider } from './task';

/** Absolute CLI paths recorded by `employ-me setup` (Chrome from the Dock has no shell PATH). */
export interface ProviderPaths {
  readonly claude?: string;
  readonly codex?: string;
}

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

export interface ProviderContext {
  readonly platform: HelperPlatform;
  /** An empty folder the CLIs run in. */
  readonly workDir: string;
  readonly logger: Logger;
  readonly models?: { readonly claude?: string; readonly codex?: string };
  /** The node running the helper; its folder goes on the CLIs' PATH (see cli-env.ts). */
  readonly nodePath?: string;
}

/**
 * Picks the Provider for a request. EMPLOY_ME_PROVIDER=fake swaps in the fake
 * for every id; EMPLOY_ME_FAKE_FAIL=<HelperErrorReason> makes it fail.
 * Returns null when the real CLI wasn't found at setup.
 */
export function selectProvider(
  id: ProviderId,
  paths: ProviderPaths,
  env: ProviderEnv,
  context: ProviderContext,
): HelperProvider | null {
  if (env[FAKE_PROVIDER_ENV] === 'fake') {
    const fail = helperErrorReasonSchema.safeParse(env['EMPLOY_ME_FAKE_FAIL']);
    const fake = createFakeProvider(id, fail.success ? { failWith: fail.data } : {});
    return { ...fake, close: () => Promise.resolve() };
  }
  const cliPath = paths[id];
  if (cliPath === undefined) return null;
  const options = {
    platform: context.platform,
    cliPath,
    cwd: context.workDir,
    env: cliEnv(context.platform, env, cliPath, context.nodePath),
    logger: context.logger,
  };
  const model = context.models?.[id];
  const withModel = model === undefined ? options : { ...options, model };
  return id === 'claude' ? createClaudeProvider(withModel) : createCodexProvider(withModel);
}

export interface ProviderRegistry {
  get(id: ProviderId): HelperProvider | null;
  /** Stops every Provider that keeps a process warm. */
  close(): Promise<void>;
}

/** One Provider per id for the host's lifetime, so Codex's app-server stays warm. */
export function createProviderRegistry(select: (id: ProviderId) => HelperProvider | null): ProviderRegistry {
  const providers = new Map<ProviderId, HelperProvider | null>();
  return {
    get(id) {
      if (!providers.has(id)) providers.set(id, select(id));
      return providers.get(id) ?? null;
    },
    async close() {
      await Promise.all(
        [...providers.values()].flatMap((provider) => (provider === null ? [] : [provider.close()])),
      );
    },
  };
}
