import type { HelperResponse } from '@employ-me/core/protocol';
import type { Logger } from '../log/logger';
import type { ProviderEnv, ProviderPaths } from '../providers/select';

export interface DispatchDeps {
  readonly paths: ProviderPaths;
  readonly env: ProviderEnv;
  readonly logger: Logger;
  readonly helperVersion: string;
  readonly logFile: string;
}

/**
 * Validates one raw message with `helperRequestSchema` (strict, so smuggled
 * keys are refused, never forwarded), picks the Provider with selectProvider,
 * and always resolves to a response: errors are HelperErrorResponse values
 * with a reason and a fix, never throws.
 */
export function dispatch(_raw: unknown, _deps: DispatchDeps, _signal: AbortSignal): Promise<HelperResponse> {
  throw new Error('not implemented');
}
