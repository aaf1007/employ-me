import { deepQueryAll, shadowHost } from '../dom';

/** How long the form must go without a change before the Fill looks again. */
export const QUIET_MS = 150;
/** The longest the Fill waits: a page that never stops changing (a spinner, a clock) can't hold it up. */
export const QUIET_CAP_MS = 1500;

// Attributes that show, hide or enable a question. `value` and
// `aria-activedescendant` change as anything is typed, and would only push the
// wait to its cap.
const FIELD_ATTRIBUTES = ['hidden', 'style', 'class', 'disabled', 'aria-hidden', 'aria-disabled', 'open'];

const OBSERVE: MutationObserverInit = { childList: true, subtree: true, attributeFilter: FIELD_ATTRIBUTES };

/**
 * Resolves once the form `findRoot` gives has had no DOM changes for
 * `QUIET_MS`, or after `QUIET_CAP_MS` at most, so the page's own scripts can
 * render what an answer brings (research 2026-10-28 §7.4). Read-only: it only
 * observes, with the page's own `MutationObserver`.
 *
 * It observes the document, which an ATS can't swap out, and counts only
 * changes inside the form: when the form leaves the page (re-rendered whole),
 * `findRoot` is asked again. Open shadow roots in the form are observed too
 * (research §5 "Shadow DOM"), including ones that appear while it waits.
 *
 * Changes the page makes in reply to the Fill's writes count: they are what
 * this waits for.
 */
export function waitForQuiet(doc: Document, findRoot: () => Element): Promise<void> {
  const view = doc.defaultView;
  if (view === null) return Promise.resolve();
  return new Promise((resolve) => {
    let root = findRoot();
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const observed = new Set<Node>();
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
    const observe = (node: Node) => {
      if (observed.has(node)) return;
      observed.add(node);
      observer.observe(node, OBSERVE);
    };
    const observeShadows = (under: Element) => {
      for (const el of [under, ...deepQueryAll(under, '*')])
        if (el.shadowRoot !== null) observe(el.shadowRoot);
    };
    const observer = new view.MutationObserver((records) => {
      if (!root.isConnected) {
        root = findRoot();
        observeShadows(root);
        restart();
        return;
      }
      const inForm = records.filter((record) => within(root, record.target));
      if (inForm.length === 0) return;
      for (const record of inForm)
        for (const node of record.addedNodes) if (isElementNode(node)) observeShadows(node);
      restart();
    });
    const cap = setTimeout(done, QUIET_CAP_MS);
    observe(doc);
    observeShadows(root);
    restart();
  });
}

/** Whether `node` is `root` or inside it, stepping out of shadow roots to their host. */
function within(root: Element, node: Node): boolean {
  for (let at: Node | null = node; at !== null; at = at.parentNode ?? shadowHost(at))
    if (at === root) return true;
  return false;
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === 1;
}
