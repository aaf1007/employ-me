/**
 * Loads a saved page into the test document. Scripts in it don't run (jsdom
 * default). jsdom stays on its own origin, so pass the page's real URL to
 * plan() and readPosting() yourself.
 */
export function loadPage(html: string): Document {
  document.documentElement.innerHTML = html.replace(/^<!doctype[^>]*>/i, '');
  return document;
}

/** Renders a snippet as the whole body. */
export function render(html: string): Document {
  document.body.innerHTML = html;
  return document;
}
