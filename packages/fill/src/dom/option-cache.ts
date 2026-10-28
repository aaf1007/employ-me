// Options of comboboxes that only render their menu while open (react-select).
// act/'s combobox driver records what it saw; extract/ reports it on the next
// plan, so a re-plan can send those options to the Provider. Memory only:
// nothing is written to the page.

const seen = new WeakMap<Element, readonly string[]>();

export function rememberOptions(combobox: Element, options: readonly string[]): void {
  if (options.length > 0) seen.set(combobox, options);
}

export function rememberedOptions(combobox: Element): readonly string[] {
  return seen.get(combobox) ?? [];
}
