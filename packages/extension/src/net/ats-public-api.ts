import { err, isPublicApiHost, ok, type PostingKey, type Result } from '@employ-me/core';
import {
  parsePublicPosting,
  publicApiRequest,
  type PublicApiParseError,
  type PublicPostingDetails,
} from '@employ-me/fill';

// The ONLY module in the extension allowed to use the network (ESLint
// enforces it). It reaches the ATSs' public, unauthenticated job APIs for
// Snapshots and nothing else: no telemetry, no analytics, no other hosts
// (design.md "Your data stays on your machine"). The manifest CSP's
// connect-src enforces the same list at runtime.

export type PublicApiError =
  | { readonly reason: 'hostNotAllowed'; readonly detail: string }
  | { readonly reason: 'network'; readonly detail: string }
  | { readonly reason: 'httpStatus'; readonly detail: string }
  | { readonly reason: 'invalidResponse'; readonly detail: string }
  | { readonly reason: 'noPublicApi'; readonly detail: string };

/**
 * The public job-API URL for a Posting (research §7): Greenhouse
 * boards-api `/v1/boards/{board}/jobs/{id}?questions=true&pay_transparency=true`,
 * Lever `/v0/postings/{co}/{id}?mode=json`, Ashby
 * `/posting-api/job-board/{org}?includeCompensation=true`. Null for the
 * generic fallback.
 */
export function publicApiUrl(key: PostingKey, formUrl?: URL): URL | null {
  const request = publicApiRequest(key, formUrl);
  return request === null ? null : new URL(request.url);
}

/** GETs JSON from an allowlisted public API host, without cookies or referrer. */
export async function fetchPublicJson(url: URL): Promise<Result<unknown, PublicApiError>> {
  if (url.protocol !== 'https:' || !isPublicApiHost(url.hostname)) {
    return err({ reason: 'hostNotAllowed', detail: url.hostname });
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      // A redirect could leave the allowlist.
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    return err({ reason: 'network', detail: error instanceof Error ? error.message : 'request failed' });
  }
  if (!response.ok) return err({ reason: 'httpStatus', detail: String(response.status) });
  try {
    const json: unknown = await response.json();
    return ok(json);
  } catch (error) {
    return err({
      reason: 'invalidResponse',
      detail: error instanceof Error ? error.message : 'not JSON',
    });
  }
}

/** The Posting's facts from its public job API: the description for the Snapshot, and form options. */
export async function fetchPublicPosting(
  key: PostingKey,
  formUrl?: URL,
): Promise<Result<PublicPostingDetails, PublicApiError | PublicApiParseError>> {
  const url = publicApiUrl(key, formUrl);
  if (url === null) return err({ reason: 'noPublicApi', detail: key.ats });
  const json = await fetchPublicJson(url);
  return json.ok ? parsePublicPosting(key, json.value) : json;
}
