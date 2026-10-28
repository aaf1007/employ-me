import type { PostingKey, Result } from '@employ-me/core';
import type { PublicApiParseError, PublicPostingDetails } from '@employ-me/fill';
import type { callBackground } from '../messaging/background-client';
import type { PublicApiError } from '../net/ats-public-api';
import type { TabLink } from './tab-link';

export type BackgroundCall = typeof callBackground;

/** What the side panel's controller works through; unit tests pass fakes. */
export interface PanelDeps {
  readonly tab: TabLink;
  readonly call: BackgroundCall;
  readonly fetchPosting: (
    key: PostingKey,
    formUrl: URL,
  ) => Promise<Result<PublicPostingDetails, PublicApiError | PublicApiParseError>>;
  readonly now: () => Date;
  /** How long detection keeps looking before it says there's no Application Form. */
  readonly detectAttempts?: number;
  readonly detectIntervalMs?: number;
}
