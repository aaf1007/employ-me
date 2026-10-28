import {
  FAKE_PROVIDER_ENV,
  helperErrorReasonSchema,
  type Provider,
  type ProviderId,
} from '@employ-me/core/protocol';
import { createClaudeProvider } from './claude';
import { createCodexProvider } from './codex';
import { createFakeProvider } from './fake';

/** Absolute CLI paths recorded by `employ-me setup` (Chrome from the Dock has no shell PATH). */
export interface ProviderPaths {
  readonly claude?: string;
  readonly codex?: string;
}

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

/**
 * Picks the Provider for a request. EMPLOY_ME_PROVIDER=fake swaps in the fake
 * for every id; EMPLOY_ME_FAKE_FAIL=<HelperErrorReason> makes it fail.
 * Returns null when the real CLI wasn't found at setup.
 */
export function selectProvider(id: ProviderId, paths: ProviderPaths, env: ProviderEnv): Provider | null {
  if (env[FAKE_PROVIDER_ENV] === 'fake') {
    const fail = helperErrorReasonSchema.safeParse(env['EMPLOY_ME_FAKE_FAIL']);
    return createFakeProvider(id, fail.success ? { failWith: fail.data } : {});
  }
  const path = paths[id];
  if (path === undefined) return null;
  return id === 'claude' ? createClaudeProvider(path) : createCodexProvider(path);
}
