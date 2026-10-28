// Low-level writes, used only by act/'s guarded operations (research §5).
// Nothing here checks what it touches: callers run checkTarget first.

type ValueProperty = 'value' | 'checked' | 'selected';

/**
 * Sets a property through its prototype's native setter, so frameworks that
 * wrap the instance's setter (React's value tracker) see a real change
 * (research §5 "Setting values on React/Vue/Angular inputs"). The prototype
 * is read from the element itself, so iframe realms work too.
 */
export function setNative(el: Element, property: ValueProperty, value: string | boolean): void {
  let proto = prototypeOf(el);
  while (proto !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, property);
    if (descriptor?.set !== undefined) {
      descriptor.set.call(el, value);
      return;
    }
    proto = prototypeOf(proto);
  }
  throw new Error(`no native ${property} setter on <${el.localName}>`);
}

function prototypeOf(value: object): object | null {
  const proto: unknown = Object.getPrototypeOf(value);
  return typeof proto === 'object' ? proto : null;
}

const BUBBLES = { bubbles: true, composed: true, cancelable: true } as const;

// jsdom (unit tests) has no PointerEvent; a MouseEvent of the same name is what handlers see there.
const Pointer: typeof MouseEvent = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;

export function fireInput(el: Element, data?: string): void {
  el.dispatchEvent(
    new InputEvent('input', { ...BUBBLES, ...(data === undefined ? {} : { data, inputType: 'insertText' }) }),
  );
}

export function fireChange(el: Element): void {
  el.dispatchEvent(new Event('change', BUBBLES));
}

export function fireFocus(el: Element): void {
  if (isFocusable(el)) el.focus({ preventScroll: true });
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
}

export function fireBlur(el: Element): void {
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
  el.dispatchEvent(new FocusEvent('blur', { composed: true }));
}

export function fireKey(el: Element, type: 'keydown' | 'keyup', key: string): void {
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
  const keyCode =
    key === 'ArrowDown' ? 40 : key === 'Escape' ? 27 : key === 'Enter' ? 13 : key.toUpperCase().charCodeAt(0);
  el.dispatchEvent(new KeyboardEvent(type, { ...BUBBLES, key, code, keyCode, which: keyCode }));
}

/** pointerdown → mousedown → pointerup → mouseup → click (research §5 "Dropdowns"). */
export function firePress(el: Element, until: 'mousedown' | 'click' = 'click'): void {
  const init = { ...BUBBLES, button: 0, buttons: 1, view: el.ownerDocument.defaultView };
  el.dispatchEvent(new Pointer('pointerdown', init));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  if (until === 'mousedown') return;
  el.dispatchEvent(new Pointer('pointerup', { ...init, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
}

/** The element's own click(), which runs native activation (ticks checkboxes, picks radios). */
export function activate(el: Element): void {
  if (isClickable(el)) el.click();
  else firePress(el);
}

function isFocusable(el: Element): el is HTMLElement {
  return 'focus' in el && typeof el.focus === 'function';
}

function isClickable(el: Element): el is HTMLElement {
  return 'click' in el && typeof el.click === 'function';
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `read` until it returns a value, or gives up after `timeoutMs`. */
export async function waitFor<T>(
  read: () => T | null,
  timeoutMs: number,
  intervalMs = 50,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== null) return value;
    if (Date.now() >= deadline) return null;
    await delay(intervalMs);
  }
}
