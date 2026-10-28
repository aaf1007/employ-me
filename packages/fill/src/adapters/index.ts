import { atsForFormHost, type AtsId } from '@employ-me/core';
import { ashbyAdapter } from './ashby';
import { genericAdapter } from './generic';
import { greenhouseAdapter } from './greenhouse';
import { leverAdapter } from './lever';
import type { AtsAdapter } from './types';

export type { AtsAdapter } from './types';

const ADAPTERS: Readonly<Record<AtsId, AtsAdapter>> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  generic: genericAdapter,
};

/** Detects the ATS from the URL (research §6 step 1). Unknown hosts get the generic adapter. */
export function adapterFor(url: URL): AtsAdapter {
  return ADAPTERS[atsForFormHost(url.hostname) ?? 'generic'];
}
