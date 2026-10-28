import type { AtsId, KnownAtsId } from '@employ-me/core';
import { deepQueryAll, isHidden, readableText } from '../dom';

/**
 * Confirmation signals (research §7): Greenhouse `/confirmation`, Lever
 * `/thanks`, Ashby `.ashby-application-form-success-container`. Anything
 * else falls back to asking "Did you apply?". An Application is created only
 * from `confirmed` or from the user saying yes.
 */
export type SubmissionSignal =
  | { readonly kind: 'confirmed'; readonly ats: KnownAtsId; readonly evidence: 'url' | 'page' }
  | { readonly kind: 'unclear' };

interface Confirmation {
  readonly url: RegExp;
  readonly selector: string;
  readonly text: RegExp;
}

const CONFIRMATIONS: Readonly<Record<KnownAtsId, Confirmation>> = {
  greenhouse: {
    url: /\/confirmation\/?$|\/embed\/job_app\/confirmation/,
    selector:
      '#application_confirmation, .application-confirmation, [data-testid="application-confirmation"], .confirmation',
    text: /\b(thank you for applying|application (has been )?(submitted|received))\b/i,
  },
  lever: {
    url: /\/thanks\/?$/,
    selector: '.application-confirmation, .thanks, [data-qa="thanks"]',
    text: /\b(application submitted|thank you for (your application|applying))\b/i,
  },
  ashby: {
    url: /\/application\/(success|submitted)\/?$/,
    selector: '.ashby-application-form-success-container',
    text: /\b(application (was )?(submitted|received)|thank(s| you) for applying)\b/i,
  },
};

/** How long after the user's own Submit a confirmation may take before we ask "Did you apply?" (research §7). */
export const CONFIRMATION_WINDOW_MS = 15_000;

/** True when `doc` at `url` is the ATS's confirmation screen. Read-only. */
export function isConfirmation(doc: Document, url: URL, ats: KnownAtsId): SubmissionSignal | null {
  const signal = CONFIRMATIONS[ats];
  if (signal.url.test(url.pathname)) return { kind: 'confirmed', ats, evidence: 'url' };
  const shown = deepQueryAll(doc, signal.selector).find((el) => !isHidden(el));
  if (shown !== undefined && signal.text.test(readableText(shown)))
    return { kind: 'confirmed', ats, evidence: 'page' };
  if (ats === 'ashby' && shown !== undefined) return { kind: 'confirmed', ats, evidence: 'page' };
  return null;
}

/**
 * Watches for the user's own submission. Reports `confirmed` when the ATS
 * shows its confirmation, or `unclear` when the user submitted the form and
 * no confirmation came within CONFIRMATION_WINDOW_MS (or on unknown sites).
 * It only observes: no listeners that cancel, no writes. Returns a function
 * that stops watching.
 */
export function watchForSubmission(
  doc: Document,
  ats: AtsId,
  onSignal: (signal: SubmissionSignal) => void,
): () => void {
  const view = doc.defaultView;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    if (stopped || ats === 'generic') return;
    const signal = isConfirmation(doc, new URL(doc.location.href), ats);
    if (signal !== null) {
      stop();
      onSignal(signal);
    }
  };
  const onSubmit = () => {
    check();
    if (stopped || timer !== null) return;
    timer = setTimeout(
      () => {
        if (stopped) return;
        stop();
        onSignal({ kind: 'unclear' });
      },
      ats === 'generic' ? 0 : CONFIRMATION_WINDOW_MS,
    );
  };
  const observer = view === null ? null : new view.MutationObserver(check);
  observer?.observe(doc.documentElement, { childList: true, subtree: true });
  // SPAs (Greenhouse's Remix boards) change the URL without a load: poll it.
  const poll = setInterval(check, 500);
  doc.addEventListener('submit', onSubmit, { capture: true, passive: true });
  check();

  function stop(): void {
    stopped = true;
    observer?.disconnect();
    clearInterval(poll);
    if (timer !== null) clearTimeout(timer);
    doc.removeEventListener('submit', onSubmit, { capture: true });
  }
  return stop;
}
