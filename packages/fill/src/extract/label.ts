import { byId, cssString, parentElement, readableText, rootScope, textOfIds } from '../dom';

// Label resolution (research §6 step 2): label[for], aria-labelledby,
// wrapping <label>, <legend>, aria-label, then the nearest question text in
// the field's container. Each source returns raw text; callers clean it.

/** Words that name a button next to a field, not the field itself. */
const GENERIC_LABEL =
  /^(attach|upload|browse|choose( a)? file|select( a)? file|enter manually|select\.*|drop files? here|or|start typing\.*|pick date\.*)$/i;

/** Containers that hold one question: its label plus its control(s). */
const FIELD_CONTAINER =
  '[data-field-path], .field-wrapper, .application-question, .field, .form-field, .form-group, .question, li, fieldset, [role="group"], [role="radiogroup"]';

const QUESTION_TEXT =
  'label, legend, [class*="question-title"], [class*="application-label"], [class*="label"], [class*="question"]';

export function usable(text: string): boolean {
  const t = text.trim();
  return t !== '' && !GENERIC_LABEL.test(t);
}

/** Label for one control. */
export function controlLabel(el: Element): string {
  const candidates = [
    () => textOfIds(el, 'aria-labelledby'),
    () => labelFor(el),
    () => wrappingLabel(el),
    () => groupLabel(el),
    () => el.getAttribute('aria-label') ?? '',
    () => containerQuestion(el, [el]),
    () => precedingText(el),
    () => el.getAttribute('title') ?? '',
    () => el.getAttribute('placeholder') ?? '',
  ];
  for (const candidate of candidates) {
    const text = candidate();
    if (usable(text)) return text;
  }
  return '';
}

/** Label for a group of radios, checkboxes or buttons that share `container`. */
export function groupQuestion(container: Element, members: readonly Element[]): string {
  const candidates = [
    () => textOfIds(container, 'aria-labelledby'),
    () => container.getAttribute('aria-label') ?? '',
    () => legendOf(container, members),
    () => containerQuestion(container, members),
    () => precedingText(container),
  ];
  for (const candidate of candidates) {
    const text = candidate();
    if (usable(text)) return text;
  }
  return '';
}

/** The text of the <label for=id> of a control. */
export function labelFor(el: Element): string {
  const id = el.getAttribute('id');
  if (id === null || id === '') return '';
  const labels = [...rootScope(el).querySelectorAll(`label[for="${cssString(id)}"]`)];
  return labels.map((label) => readableText(label)).find(usable) ?? '';
}

function wrappingLabel(el: Element): string {
  const label = el.closest('label');
  if (label === null) return '';
  // Lever: <label><div class="application-label">Full name</div><div class="application-field"><input></div></label>
  const inner = label.querySelector('[class*="label"]');
  if (inner !== null && !inner.contains(el)) return readableText(inner);
  // <label><span>Resume*</span><div><input type=file></div><span>File types: …</span></label>
  const first = label.firstElementChild;
  if (first !== null && !first.contains(el) && first.querySelector('input, select, textarea') === null) {
    const text = readableText(first);
    if (usable(text)) return text;
  }
  return readableText(label);
}

/**
 * Text just before the control in a layout without semantic labels:
 * <div><span>Are you open to relocation?</span><div><label><input type=radio> No</label>…</div></div>
 */
export function precedingText(from: Element): string {
  let node: Element | null = from;
  for (let depth = 0; node !== null && depth < 4; depth++, node = parentElement(node)) {
    // Never past the form or the page body: that text belongs to something else.
    if (['form', 'body', 'html'].includes(node.localName)) break;
    let sibling = node.previousElementSibling;
    for (let hops = 0; sibling !== null && hops < 3; hops++, sibling = sibling.previousElementSibling) {
      if (sibling.querySelector('input, select, textarea, button') !== null) break;
      const text = readableText(sibling);
      if (usable(text)) return text;
    }
  }
  return '';
}

function groupLabel(el: Element): string {
  const group = el.closest('[role="group"][aria-labelledby], fieldset');
  if (group === null) return '';
  const byIds = textOfIds(group, 'aria-labelledby');
  if (byIds !== '') return byIds;
  return legendOf(group, [el]);
}

function legendOf(container: Element, members: readonly Element[]): string {
  const fieldset = container.localName === 'fieldset' ? container : container.closest('fieldset');
  if (fieldset === null || !members.every((m) => fieldset.contains(m))) return '';
  const legend = [...fieldset.children].find((child) => child.localName === 'legend');
  if (legend !== undefined) return readableText(legend);
  // Ashby puts a <label> as the fieldset's first child instead of a legend.
  const label = [...fieldset.children].find(
    (child) => child.localName === 'label' && !members.some((m) => child.contains(m)),
  );
  return label === undefined ? '' : readableText(label);
}

/**
 * The question text of the nearest container that holds the control: its
 * first label-like element that isn't one of the members' own option labels.
 */
export function containerQuestion(from: Element, members: readonly Element[]): string {
  const own = new Set(members.flatMap((m) => ownLabels(m)));
  let node: Element | null = parentElement(from);
  for (let depth = 0; node !== null && depth < 6; depth++, node = parentElement(node)) {
    if (!node.matches(FIELD_CONTAINER)) continue;
    // Ashby: <label for="<data-field-path>"> whose target id doesn't exist.
    const path = node.getAttribute('data-field-path');
    if (path !== null) {
      const label = node.querySelector(`label[for="${cssString(path)}"]`);
      if (label !== null && usable(readableText(label))) return readableText(label);
    }
    for (const candidate of node.querySelectorAll(QUESTION_TEXT)) {
      if (
        own.has(candidate) ||
        members.some((m) => candidate.contains(m) && candidate.localName !== 'fieldset')
      ) {
        continue;
      }
      if (candidate.closest('[role="listbox"], [role="option"], button') !== null) continue;
      const text = readableText(candidate);
      if (usable(text)) return text;
    }
  }
  return '';
}

function ownLabels(el: Element): Element[] {
  const labels: Element[] = [];
  const wrapping = el.closest('label');
  if (wrapping !== null) labels.push(wrapping);
  const id = el.getAttribute('id');
  if (id !== null && id !== '') {
    labels.push(...rootScope(el).querySelectorAll(`label[for="${cssString(id)}"]`));
  }
  return labels;
}

/** The label text of one option in a radio or checkbox group. */
export function optionLabel(el: Element): string {
  const id = el.getAttribute('id');
  if (id !== null && id !== '') {
    const text = labelFor(el);
    if (text !== '') return text;
  }
  const wrapping = el.closest('label');
  if (wrapping !== null) return readableText(wrapping);
  const aria = el.getAttribute('aria-label');
  if (aria !== null && aria.trim() !== '') return aria;
  // Text right after the control: <input type=radio> Yes
  const next = el.nextElementSibling;
  if (next !== null) return readableText(next);
  return el.getAttribute('value') ?? '';
}

/** Text of the element `aria-describedby` points at, minus error placeholders. */
export function describedBy(el: Element): string {
  const ids = (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id !== '' && !/error|help$/i.test(id));
  return ids
    .map((id) => readableText(byId(el, id)))
    .filter((t) => t !== '')
    .join(' ');
}
