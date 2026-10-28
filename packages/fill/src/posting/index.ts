import type { Posting, PostingKey } from '@employ-me/core';

/** `(ats, board, jobId)` from a form or job URL, or null if it isn't one we know. */
export function postingKeyFromUrl(_url: URL): PostingKey | null {
  throw new Error('not implemented');
}

/** Removes utm_* and other tracking parameters (research §7 "De-duplication"). */
export function canonicalPostingUrl(_url: URL): URL {
  throw new Error('not implemented');
}

/**
 * Reads what the page itself shows about the Posting (title, company,
 * location, country, schema.org JobPosting JSON-LD). The public job APIs are
 * fetched by the extension's allowlisted network module, not here.
 */
export function readPosting(_doc: Document, _url: URL): Posting | null {
  throw new Error('not implemented');
}
