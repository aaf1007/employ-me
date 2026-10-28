import { err, isPublicApiHost, type PostingKey, type Result } from '@employ-me/core';

// The ONLY module in the extension allowed to use the network (ESLint
// enforces it). It reaches the ATSs' public, unauthenticated job APIs for
// Snapshots and nothing else: no telemetry, no analytics, no other hosts
// (design.md "Your data stays on your machine"). The manifest CSP's
// connect-src enforces the same list at runtime.

export type PublicApiError =
  | { readonly reason: 'hostNotAllowed'; readonly detail: string }
  | { readonly reason: 'network'; readonly detail: string }
  | { readonly reason: 'httpStatus'; readonly detail: string }
  | { readonly reason: 'invalidResponse'; readonly detail: string };

/**
 * The public job-API URL for a Posting (research §7): Greenhouse
 * boards-api `/v1/boards/{board}/jobs/{id}?questions=true&pay_transparency=true`,
 * Lever `/v0/postings/{co}?mode=json`, Ashby
 * `/posting-api/job-board/{org}?includeCompensation=true`.
 */
export function publicApiUrl(_key: PostingKey): URL | null {
  throw new Error('not implemented');
}

/** GETs JSON from an allowlisted public API host, without cookies or referrer. */
export function fetchPublicJson(url: URL): Promise<Result<unknown, PublicApiError>> {
  if (url.protocol !== 'https:' || !isPublicApiHost(url.hostname)) {
    return Promise.resolve(err({ reason: 'hostNotAllowed', detail: url.hostname }));
  }
  return Promise.reject(new Error('not implemented'));
}
