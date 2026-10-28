import type { KnownAtsId } from '@employ-me/core';

/**
 * Confirmation signals (research §7): Greenhouse `/confirmation`, Lever
 * `/thanks`, Ashby `.ashby-application-form-success-container`. Anything
 * else falls back to asking "Did you apply?". An Application is created only
 * from `confirmed` or from the user saying yes.
 */
export type SubmissionSignal =
  { readonly kind: 'confirmed'; readonly ats: KnownAtsId } | { readonly kind: 'unclear' };

/** Watches for the user's own submission. Returns a function that stops watching. */
export function watchForSubmission(
  _doc: Document,
  _ats: KnownAtsId,
  _onSignal: (signal: SubmissionSignal) => void,
): () => void {
  throw new Error('not implemented');
}
