import {
  PROTOCOL_VERSION,
  PROVIDER_IDS,
  type HealthResult,
  type ProviderId,
  type ProviderStatus,
} from '@employ-me/core/protocol';
import { providerError } from '../providers/errors';
import type { ProviderRegistry } from '../providers/select';
import { HELPER_VERSION } from '../version';

export interface HealthInfo {
  readonly logFile: string;
  readonly fakeProvider: boolean;
}

/** What the side panel shows when the AI is unavailable, and what `employ-me doctor` prints. */
export async function healthResult(providers: ProviderRegistry, info: HealthInfo): Promise<HealthResult> {
  const statuses = await Promise.all(
    PROVIDER_IDS.map((id) => providers.get(id)?.status() ?? Promise.resolve(notInstalled(id))),
  );
  return {
    helperVersion: HELPER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    fakeProvider: info.fakeProvider,
    logFile: info.logFile,
    providers: statuses,
  };
}

export function notInstalled(id: ProviderId): ProviderStatus {
  return {
    id,
    state: 'notFound',
    problem: providerError(id, 'providerNotFound', `Setup didn't find the ${id} CLI`),
  };
}
