import { byId } from './query';

const INLINE = new Set([
  'span',
  'a',
  'b',
  'strong',
  'i',
  'em',
  'small',
  'sup',
  'sub',
  'abbr',
  'code',
  'mark',
  'u',
  's',
]);
const SKIPPED = new Set(['script', 'style', 'svg', 'noscript', 'template', 'select', 'option']);

/**
 * The text a user reads in `el`, whitespace collapsed. Skips scripts, icons,
 * and the text of nested controls (a <select>'s options are not its label).
 */
export function readableText(el: Element | null | undefined): string {
  if (el === null || el === undefined) return '';
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (!isElementNode(node)) return;
    const element = node;
    if (SKIPPED.has(element.localName)) return;
    if (element.getAttribute('aria-hidden') === 'true' && element.textContent.trim() === '*') return;
    // Blocks separate words ("Resume/CV" then "Attach"); inline text runs on ("+" "1" is "+1").
    const block = !INLINE.has(element.localName);
    if (block) parts.push(' ');
    for (const child of element.childNodes) visit(child);
    if (block) parts.push(' ');
  };
  visit(el);
  return collapse(parts.join(''));
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === 1;
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const REQUIRED_MARK = /\s*(?:\*|✱|\(\s*required\s*\)|\(\s*obligatoire\s*\))\s*$/i;
const OPTIONAL_MARK = /^\s*\(\s*optional\s*\)\s*|\s*\(\s*optional\s*\)\s*$/i;

/** A label without its required/optional markers. */
export function cleanLabel(text: string): string {
  let out = collapse(text);
  for (let i = 0; i < 3; i++) out = out.replace(REQUIRED_MARK, '').replace(OPTIONAL_MARK, '');
  return out.trim();
}

/** True when the visible label carries a required marker. */
export function labelMarksRequired(text: string): boolean {
  return /(\*|✱)\s*$|\(\s*required\s*\)/i.test(collapse(text));
}

/** The text of every element an aria-labelledby/-describedby attribute points at. */
export function textOfIds(near: Element, attribute: string): string {
  const ids = near.getAttribute(attribute);
  if (ids === null) return '';
  return collapse(
    ids
      .split(/\s+/)
      .filter((id) => id !== '')
      .map((id) => readableText(byId(near, id)))
      .join(' '),
  );
}
