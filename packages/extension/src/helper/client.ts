import type {
  HelperError,
  HelperRequestOf,
  HelperRequestType,
  HelperResultOf,
  Result,
} from '@employ-me/core';

/**
 * The extension's end of the helper protocol (ADR-0001): one
 * `runtime.connectNative(HELPER_HOST_NAME)` port, kept open by the side panel
 * so the helper stays warm. Requests and responses are matched by `id` and
 * validated with core's schemas. A missing helper surfaces as
 * `helperNotInstalled`; it never blocks a Fill (design.md "AI").
 */
export interface HelperClient {
  request<T extends HelperRequestType>(
    message: Omit<HelperRequestOf<T>, 'v' | 'id'>,
  ): Promise<Result<HelperResultOf<T>, HelperError>>;
  close(): void;
}

export function connectHelper(): HelperClient {
  throw new Error('not implemented');
}
