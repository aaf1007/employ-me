import { watchForSubmission, type AtsAdapter, type SubmissionSignal } from '@employ-me/fill';

export interface PageWatchHandlers {
  /** The form's values may have changed: you typed, chose, or pressed a button. */
  readonly onEdit: (now: boolean) => void;
  readonly onSubmission: (signal: SubmissionSignal) => void;
  /** Fields appeared that no plan has seen yet: the next step, or a follow-up question. */
  readonly onNewFields: () => void;
}

const EDIT_DEBOUNCE_MS = 300;
const CHANGE_DEBOUNCE_MS = 600;

/**
 * Watches the page while a Fill is open. Listeners are passive and capture
 * only: nothing is cancelled and nothing is written (design.md "Nothing is
 * injected into job sites' own pages"). Returns a function that stops it.
 */
export function watchPage(
  doc: Document,
  adapter: AtsAdapter,
  knownFieldIds: () => ReadonlySet<string>,
  handlers: PageWatchHandlers,
): () => void {
  const view = doc.defaultView;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
    return timer;
  };

  let editTimer: ReturnType<typeof setTimeout> | null = null;
  const edited = () => {
    if (editTimer !== null) clearTimeout(editTimer);
    editTimer = later(EDIT_DEBOUNCE_MS, () => {
      handlers.onEdit(false);
    });
  };
  // Your own clicks (Next, Submit) send the answers at once: a Submit may navigate away next.
  const pressed = () => {
    handlers.onEdit(true);
  };
  const listen = { capture: true, passive: true } as const;
  doc.addEventListener('input', edited, listen);
  doc.addEventListener('change', edited, listen);
  doc.addEventListener('pointerdown', pressed, listen);
  doc.addEventListener('submit', pressed, listen);

  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  const lookForNewFields = () => {
    const form = adapter.findForm(doc);
    if (form === null) return;
    const known = knownFieldIds();
    if (adapter.extract(form).some((f) => !known.has(f.fieldId))) handlers.onNewFields();
  };
  const observer =
    view === null
      ? null
      : new view.MutationObserver(() => {
          if (changeTimer !== null) clearTimeout(changeTimer);
          changeTimer = later(CHANGE_DEBOUNCE_MS, lookForNewFields);
        });
  observer?.observe(doc.documentElement, { childList: true, subtree: true });

  const stopSubmission = watchForSubmission(doc, adapter.ats, handlers.onSubmission);

  return () => {
    stopSubmission();
    observer?.disconnect();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    doc.removeEventListener('input', edited, listen);
    doc.removeEventListener('change', edited, listen);
    doc.removeEventListener('pointerdown', pressed, listen);
    doc.removeEventListener('submit', pressed, listen);
  };
}
