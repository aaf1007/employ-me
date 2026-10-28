// A Posting's description is untrusted text from the job site, often HTML
// (sometimes HTML-escaped HTML, as Greenhouse's API returns it). The Tracker
// shows it as plain text only: it is parsed in an inert DOMParser document,
// which runs no scripts and loads nothing, and only its text is kept.

const BLOCKS = new Set([
  'p',
  'div',
  'br',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
  'section',
  'article',
]);
const LOOKS_LIKE_HTML = /<\/?[a-z][^>]*>/i;
const ESCAPED_HTML = /&lt;\/?[a-z]/i;

export function descriptionText(description: string): string {
  let text = description;
  // Escaped HTML decodes to HTML; at most twice, for doubly-escaped feeds.
  for (let pass = 0; pass < 2 && ESCAPED_HTML.test(text) && !LOOKS_LIKE_HTML.test(text); pass++) {
    text = new DOMParser().parseFromString(text, 'text/html').body.textContent;
  }
  if (!LOOKS_LIKE_HTML.test(text)) return text.trim();
  const body = new DOMParser().parseFromString(text, 'text/html').body;
  return collect(body)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collect(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
  const name = node.nodeType === Node.ELEMENT_NODE ? node.nodeName.toLowerCase() : '';
  if (name === 'script' || name === 'style') return '';
  const inner = Array.from(node.childNodes, collect).join('');
  if (name === 'li') return `\n• ${inner.trim()}`;
  return BLOCKS.has(name) ? `\n${inner.trim()}\n` : inner;
}
