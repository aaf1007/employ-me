// Read-only DOM helpers shared by extract/, adapters and act/'s read-backs.
// Element kinds are checked with localName, never instanceof: elements from
// iframes belong to another realm (CODING_STANDARDS.md "DOM").

/** Every element under `root` matching `selector`, in document order, including inside open shadow roots. */
export function deepQueryAll(root: ParentNode, selector: string): Element[] {
  const found: Element[] = [];
  const visit = (node: ParentNode) => {
    for (const el of node.querySelectorAll('*')) {
      if (el.matches(selector)) found.push(el);
      // Walk open shadow roots (research §5 "Shadow DOM"); closed ones need chrome.dom, which fill can't use.
      if (el.shadowRoot !== null) visit(el.shadowRoot);
    }
  };
  visit(root);
  return found;
}

/** The element with `id` in the same document or shadow root as `near`. */
export function byId(near: Element, id: string): Element | null {
  const root = near.getRootNode();
  if (isQueryable(root)) {
    const found = root.querySelector(`[id="${cssString(id)}"]`);
    if (found !== null) return found;
  }
  return near.ownerDocument.getElementById(id);
}

/** Elements with `name` in the same document or shadow root as `near`. */
export function byName(near: Element, name: string, selector = 'input'): Element[] {
  const root = near.getRootNode();
  const scope: ParentNode = isQueryable(root) ? root : near.ownerDocument;
  return [...scope.querySelectorAll(`${selector}[name="${cssString(name)}"]`)];
}

/** The document or shadow root `el` lives in, for scoped queries. */
export function rootScope(el: Element): ParentNode {
  const root = el.getRootNode();
  return isQueryable(root) ? root : el.ownerDocument;
}

function isQueryable(node: Node): node is Document | ShadowRoot {
  return node.nodeType === 9 || node.nodeType === 11;
}

/** Escapes a value for use inside a double-quoted CSS attribute selector. */
export function cssString(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

export function isInput(el: Element): el is HTMLInputElement {
  return el.localName === 'input';
}

export function isSelect(el: Element): el is HTMLSelectElement {
  return el.localName === 'select';
}

export function isTextArea(el: Element): el is HTMLTextAreaElement {
  return el.localName === 'textarea';
}

/** The `type` of an input, lower-cased, defaulting to "text" as browsers do. */
export function inputType(el: Element): string {
  return (el.getAttribute('type') ?? 'text').toLowerCase();
}

/**
 * True when the element or an ancestor is hidden from the user. Uses
 * attributes and computed style only, so it also works in jsdom (no layout).
 * Visually-hidden file inputs styled off-screen still count as shown: they
 * are the real control behind an "Attach" button.
 */
export function isHidden(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  let node: Element | null = el;
  for (let depth = 0; node !== null && depth < 12; depth++) {
    if (node.hasAttribute('hidden')) return true;
    if (node !== el && node.getAttribute('aria-hidden') === 'true') return true;
    if (view !== null) {
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    node = parentElement(node);
  }
  return false;
}

/** The parent element, stepping out of shadow roots to their host. */
export function parentElement(el: Element): Element | null {
  if (el.parentElement !== null) return el.parentElement;
  const root = el.getRootNode();
  return root.nodeType === 11 && 'host' in root && isElement(root.host) ? root.host : null;
}

function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'localName' in value;
}

/** Whether `a` comes before `b` in document order. */
export function precedes(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & 4) !== 0;
}
