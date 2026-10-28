import { deepQueryAll, precedes, readableText } from '../dom';

// A field's section is the last heading before it in document order. The
// page's <h1> is the job title, never a section: a "Diversity Programs Lead"
// posting must not make every field look like a Self-ID question.

const HEADINGS = 'h2, h3, h4, h5, h6, [role="heading"]:not(h1)';

export interface SectionIndex {
  sectionOf(el: Element): string | undefined;
}

export function indexSections(
  root: ParentNode,
  extraSelector: string | undefined,
  isIgnored: (el: Element) => boolean,
): SectionIndex {
  const selector = extraSelector === undefined ? HEADINGS : `${HEADINGS}, ${extraSelector}`;
  const headings = deepQueryAll(root, selector)
    .map((el) => ({ el, text: readableText(el) }))
    .filter((h) => h.text !== '' && h.text.length <= 200 && !isIgnored(h.el));
  return {
    sectionOf(el) {
      let section: string | undefined;
      for (const heading of headings) {
        if (heading.el.contains(el)) continue;
        if (precedes(heading.el, el)) section = heading.text;
        else break;
      }
      return section;
    },
  };
}
