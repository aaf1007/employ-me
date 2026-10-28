import { collapse } from '../../dom';

// A company's own site has no public job API, and often no JSON-LD: the
// page's own text is then all there is to keep in the Snapshot (research §7
// "Snapshot at apply time"). It is used only there, never sent to a Provider.

/** Kept to the Snapshot's purpose: the job description, without the site's chrome or the form. */
const LEFT_OUT = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
  'dialog',
  'form',
  'fieldset',
  'label',
  'legend',
  'button',
  'select',
  'option',
  'textarea',
]);

const MAX_LENGTH = 100_000;

/** The readable text of the page's main content, leaving out the Application Form. */
export function postingPageText(doc: Document, form: Element | null): string {
  const root = doc.querySelector('main, [role="main"], article') ?? doc.body;
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (!isElement(node)) return;
    const leftOut =
      (node === form && node !== root) ||
      LEFT_OUT.has(node.localName) ||
      node.hasAttribute('hidden') ||
      node.getAttribute('aria-hidden') === 'true';
    if (leftOut) return;
    parts.push(' ');
    for (const child of node.childNodes) visit(child);
    parts.push(' ');
  };
  visit(root);
  return collapse(parts.join('')).slice(0, MAX_LENGTH);
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}
