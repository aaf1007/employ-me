import { err, ok } from '@employ-me/core';
import { checkTarget } from './guard';
import type { ActResult } from './types';

// The Fill's matching outlines on the page (design.md "What you see"). They
// are the one thing a Fill shows on a job site's page, so they stay as small
// as possible: the field's own inline `outline` and `outline-offset`, saved
// first and put back exactly when cleared. No elements, classes, stylesheets
// or attributes are added (CODING_STANDARDS.md "DOM").

export type OutlineTone = 'filled' | 'needsReview' | 'couldNotFill';

/** The side panel's colours for its three groups. */
const COLORS: Readonly<Record<OutlineTone, string>> = {
  filled: '#15803d',
  needsReview: '#b45309',
  couldNotFill: '#b91c1c',
};

const PROPERTIES = ['outline', 'outline-offset'] as const;

interface SavedStyle {
  readonly value: string;
  readonly priority: string;
}

const saved = new WeakMap<Element, ReadonlyMap<string, SavedStyle>>();
const outlined = new Set<Element>();

/** Outlines a field in the colour of its outcome; `null` restores what the page had. */
export function outlineField(el: Element, tone: OutlineTone | null): ActResult {
  const style = styleOf(el);
  if (style === null) return err({ reason: 'wrongElementKind', detail: 'outline needs an HTML element' });
  if (tone === null) {
    restore(el, style);
    return ok(undefined);
  }
  const refusal = checkTarget(el, 'outline', null);
  if (refusal !== null) return err(refusal);
  if (!saved.has(el)) {
    saved.set(
      el,
      new Map(
        PROPERTIES.map((p) => [
          p,
          { value: style.getPropertyValue(p), priority: style.getPropertyPriority(p) },
        ]),
      ),
    );
  }
  style.setProperty('outline', `2px solid ${COLORS[tone]}`, 'important');
  style.setProperty('outline-offset', '2px', 'important');
  outlined.add(el);
  return ok(undefined);
}

/** Restores every outline this document's Fill drew. */
export function clearOutlines(): void {
  for (const el of outlined) {
    const style = styleOf(el);
    if (style !== null) restore(el, style);
  }
  outlined.clear();
}

function restore(el: Element, style: CSSStyleDeclaration): void {
  const before = saved.get(el);
  if (before === undefined) return;
  for (const [property, { value, priority }] of before) {
    if (value === '') style.removeProperty(property);
    else style.setProperty(property, value, priority);
  }
  saved.delete(el);
  outlined.delete(el);
}

function styleOf(el: Element): CSSStyleDeclaration | null {
  return isStyled(el) ? el.style : null;
}

// Not instanceof: elements from iframes belong to another realm (CODING_STANDARDS.md "DOM").
function isStyled(el: Element): el is HTMLElement {
  return el.namespaceURI === 'http://www.w3.org/1999/xhtml';
}
