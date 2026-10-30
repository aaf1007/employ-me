/** How long the form must go without a change before the Fill looks again. */
export const QUIET_MS = 150;
/** The longest the Fill waits: a page that never stops changing (a spinner, a clock) can't hold it up. */
export const QUIET_CAP_MS = 1500;

// Attributes that show, hide or enable a question. `value` and
// `aria-activedescendant` change as anything is typed, and would only push the
// wait to its cap.
const FIELD_ATTRIBUTES = ['hidden', 'style', 'class', 'disabled', 'aria-hidden', 'aria-disabled', 'open'];

/**
 * Resolves once `root` has had no DOM changes for `QUIET_MS`, or after
 * `QUIET_CAP_MS` at most, so the page's own scripts can render what an answer
 * brings (research 2026-10-28 §7.4). Read-only: it only observes, with the
 * page's own `MutationObserver`.
 *
 * Changes the page makes in reply to the Fill's writes count: they are what
 * this waits for.
 */
export function waitForQuiet(root: Element): Promise<void> {
  const view = root.ownerDocument.defaultView;
  if (view === null) return Promise.resolve();
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve();
    };
    const restart = () => {
      clearTimeout(quiet);
      quiet = setTimeout(done, QUIET_MS);
    };
    const observer = new view.MutationObserver(restart);
    const cap = setTimeout(done, QUIET_CAP_MS);
    observer.observe(root, { childList: true, subtree: true, attributeFilter: FIELD_ATTRIBUTES });
    restart();
  });
}
