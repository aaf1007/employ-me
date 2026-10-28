import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Proves the boundary rules in eslint.config.js fire where design.md says
// they must, and stay quiet where they mustn't. Uses the real config with
// type-aware rules switched off, so snippets need not exist on disk.

const ROOT = path.resolve(import.meta.dirname, '../..');
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

const BOUNDARY_RULES = new Set([
  'no-restricted-syntax',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-imports',
]);

async function boundaryErrors(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId !== null && BOUNDARY_RULES.has(m.ruleId))
    .map((m) => m.message);
}

const cases: Array<{ name: string; file: string; code: string; expect: RegExp | null }> = [
  // DOM writes only in act/
  {
    name: 'raw click in classify',
    file: 'packages/fill/src/classify/x.ts',
    code: 'export const f = (el: HTMLElement) => { el.click(); };',
    expect: /Raw \.click\(\) is banned/,
  },
  {
    name: 'dispatchEvent in an adapter',
    file: 'packages/fill/src/adapters/greenhouse/x.ts',
    code: "export const f = (el: HTMLElement) => el.dispatchEvent(new Event('input'));",
    expect: /dispatchEvent/,
  },
  {
    name: 'value assignment in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const f = (el: HTMLInputElement) => { el.value = 'x'; };",
    expect: /DOM write/,
  },
  {
    name: 'files assignment in fill',
    file: 'packages/fill/src/extract/x.ts',
    code: 'export const f = (el: HTMLInputElement, d: DataTransfer) => { el.files = d.files; };',
    expect: /DOM write/,
  },
  {
    name: 'prototype setter trick outside act',
    file: 'packages/fill/src/x.ts',
    code: "export const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');",
    expect: /prototype value-setter/,
  },
  {
    name: 'click inside act',
    file: 'packages/fill/src/act/x.ts',
    code: 'export const f = (el: HTMLElement) => { el.click(); };',
    expect: null,
  },
  {
    name: 'click in a unit test (simulating the user)',
    file: 'packages/fill/src/detect-submission/x.test.ts',
    code: 'export const f = (el: HTMLElement) => { el.click(); };',
    expect: null,
  },
  // DOM writes, by any spelling
  {
    name: 'click by computed key',
    file: 'packages/fill/src/classify/x.ts',
    code: "export const f = (el: HTMLElement) => { el['click'](); };",
    expect: /Raw \.click\(\) is banned/,
  },
  {
    name: 'click by template key',
    file: 'packages/fill/src/extract/x.ts',
    code: 'export const f = (el: HTMLElement) => { el[`click`](); };',
    expect: /Raw \.click\(\) is banned/,
  },
  {
    name: "click through the prototype's .call",
    file: 'packages/extension/src/ui/x.ts',
    code: 'export const f = (el: HTMLElement) => { HTMLElement.prototype.click.call(el); };',
    expect: /Raw \.click\(\) is banned/,
  },
  {
    name: 'click by destructuring',
    file: 'packages/fill/src/plan/x.ts',
    code: 'export const f = (el: HTMLElement) => { const { click } = el; click.call(el); };',
    expect: /Raw \.click\(\) is banned/,
  },
  {
    name: 'Object.assign onto an element',
    file: 'packages/fill/src/adapters/lever/x.ts',
    code: "export const f = (el: HTMLInputElement) => Object.assign(el, { value: 'x' });",
    expect: /Object\.assign may fill only a new object literal/,
  },
  {
    name: 'value by computed key',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const f = (el: HTMLInputElement) => { el['value'] = 'x'; };",
    expect: /DOM write/,
  },
  {
    name: 'checked by template key',
    file: 'packages/fill/src/answer/x.ts',
    code: 'export const f = (el: HTMLInputElement) => { el[`checked`] = true; };',
    expect: /DOM write/,
  },
  {
    name: 'value by destructuring assignment',
    file: 'packages/fill/src/answer/x.ts',
    code: "export const f = (el: HTMLInputElement) => { [el.value] = ['x']; };",
    expect: /DOM write/,
  },
  {
    name: 'textContent in a content script',
    file: 'packages/extension/src/entrypoints/x.content.ts',
    code: "export const f = (el: Element) => { el.textContent = 'x'; };",
    expect: /DOM write/,
  },
  {
    name: "setAttribute('value') outside act",
    file: 'packages/fill/src/adapters/ashby/x.ts',
    code: "export const f = (el: Element) => el.setAttribute('value', 'x');",
    expect: /Raw \.setAttribute\(\) is banned/,
  },
  {
    name: "setAttribute('checked') in the extension",
    file: 'packages/extension/src/ui/x.ts',
    code: "export const f = (el: Element) => el.setAttribute('checked', '');",
    expect: /Raw \.setAttribute\(\) is banned/,
  },
  {
    name: 'defineProperty onto an element',
    file: 'packages/fill/src/x.ts',
    code: "export const f = (el: Element) => Object.defineProperty(el, 'value', { value: 'x' });",
    expect: /prototype value-setter/,
  },
  {
    name: 'Reflect outside act',
    file: 'packages/extension/src/ui/x.ts',
    code: 'export const f = (el: HTMLElement) => Reflect.apply(HTMLElement.prototype.focus, el, []);',
    expect: /Reflect .* is a way around the DOM-write ban/,
  },
  {
    name: 'Object.assign onto a new object literal',
    file: 'packages/fill/src/x.ts',
    code: 'export const f = (a: object, b: object) => Object.assign({}, a, b);',
    expect: null,
  },
  {
    name: 'reading values outside act',
    file: 'packages/fill/src/extract/x.ts',
    code: 'export const f = (el: HTMLInputElement) => [el.value, el.checked, el.textContent];',
    expect: null,
  },
  // Markup and elements are injection: everywhere but tests, act/ included
  {
    name: 'insertAdjacentHTML in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (el: Element) => { el.insertAdjacentHTML('beforeend', '<b>x</b>'); };",
    expect: /builds markup or elements/,
  },
  {
    name: 'innerHTML in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (el: Element) => { el.innerHTML = '<img src=x>'; };",
    expect: /Assigning HTML is injection/,
  },
  {
    name: 'outerHTML in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const f = (el: Element) => { el['outerHTML'] = ''; };",
    expect: /Assigning HTML is injection/,
  },
  {
    name: 'innerHTML in a unit test (fixture set-up)',
    file: 'packages/fill/src/extract/x.test.ts',
    code: "document.body.innerHTML = '<input>';",
    expect: null,
  },
  {
    name: 'innerHTML in test support',
    file: 'packages/fill/src/test-support/x.ts',
    code: 'export const render = (html: string) => { document.body.innerHTML = html; };',
    expect: null,
  },
  // fill outside act/ only reads the page
  {
    name: 'style write in fill',
    file: 'packages/fill/src/plan/x.ts',
    code: "export const f = (el: HTMLElement) => { el.style.outline = '2px solid red'; };",
    expect: /changes the page/,
  },
  {
    name: 'remove() in an adapter',
    file: 'packages/fill/src/adapters/greenhouse/x.ts',
    code: 'export const f = (el: Element) => { el.remove(); };',
    expect: /changes the page/,
  },
  {
    name: 'computed-key write in fill',
    file: 'packages/fill/src/posting/x.ts',
    code: 'export const f = (el: Element, key: string) => { Object(el)[key] = 1; };',
    expect: /writes nothing through a computed key/,
  },
  {
    name: 'computed-key call in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (form: HTMLFormElement, name: 'reset') => { form[name](); };",
    expect: /calls no method through a computed key/,
  },
  // Never submit, act/ included
  {
    name: 'requestSubmit even inside act',
    file: 'packages/fill/src/act/x.ts',
    code: 'export const f = (form: HTMLFormElement) => { form.requestSubmit(); };',
    expect: /never submits a form/,
  },
  {
    name: 'submit by computed key in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (form: HTMLFormElement) => { form['submit'](); };",
    expect: /never submits a form/,
  },
  {
    name: 'requestSubmit by computed key in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (form: HTMLFormElement) => { form['requestSubmit'](); };",
    expect: /never submits a form/,
  },
  {
    name: "requestSubmit through the prototype's .call",
    file: 'packages/extension/src/ui/x.ts',
    code: 'export const f = (form: HTMLFormElement) => { HTMLFormElement.prototype.requestSubmit.call(form); };',
    expect: /never submits a form/,
  },
  {
    name: 'requestSubmit by destructuring',
    file: 'packages/fill/src/x.ts',
    code: 'export const f = (form: HTMLFormElement) => { const { requestSubmit } = form; requestSubmit.call(form); };',
    expect: /never submits a form/,
  },
  {
    name: 'dispatching a submit event in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { bubbles: true }));",
    expect: /'submit' event/,
  },
  {
    name: 'dispatching a SubmitEvent in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (form: HTMLFormElement) => form.dispatchEvent(new SubmitEvent('submit'));",
    expect: /SubmitEvent submits the form/,
  },
  {
    name: 'a submit event by template literal in act',
    file: 'packages/fill/src/act/x.ts',
    code: 'export const e = new Event(`submit`);',
    expect: /'submit' event/,
  },
  {
    name: 'dispatching a ready-made event in act',
    file: 'packages/fill/src/act/x.ts',
    code: 'export const f = (el: Element, event: Event) => el.dispatchEvent(event);',
    expect: /built in place with a literal type/,
  },
  {
    name: 'dispatching an event of a computed type in act',
    file: 'packages/fill/src/act/x.ts',
    code: 'export const f = (el: Element, type: string) => el.dispatchEvent(new Event(type));',
    expect: /built in place with a literal type/,
  },
  {
    name: 'createEvent in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const e = document.createEvent('Event');",
    expect: /never submits a form/,
  },
  {
    name: 'dispatching an input event in act',
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (el: Element) => el.dispatchEvent(new Event('input', { bubbles: true }));",
    expect: null,
  },
  // No network outside the allowlisted module
  {
    name: 'fetch in the side panel',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const r = fetch('https://example.com/collect');",
    expect: /Zero telemetry/,
  },
  {
    name: 'sendBeacon in fill',
    file: 'packages/fill/src/x.ts',
    code: "export const r = navigator.sendBeacon('https://example.com', '');",
    expect: /telemetry/,
  },
  {
    name: 'http import in the helper',
    file: 'packages/helper/src/x.ts',
    code: "import { request } from 'node:https';\nexport { request };",
    expect: /Network library/,
  },
  {
    name: 'fetch in the allowlisted module',
    file: 'packages/extension/src/net/ats-public-api.ts',
    code: "export const r = fetch('https://boards-api.greenhouse.io/v1/boards/acme/jobs');",
    expect: null,
  },
  {
    name: 'anything but fetch in the allowlisted module',
    file: 'packages/extension/src/net/ats-public-api.ts',
    code: "export const s = new WebSocket('wss://example.com');",
    expect: /WebSocket is network access/,
  },
  {
    name: 'new Image().src in fill',
    file: 'packages/fill/src/x.ts',
    code: 'export const f = (data: string) => { new Image().src = `https://example.com/p?d=${data}`; };',
    expect: /Image loads a URL/,
  },
  {
    name: 'src assignment in act',
    file: 'packages/fill/src/act/x.ts',
    code: 'export const f = (img: HTMLImageElement, url: string) => { img.src = url; };',
    expect: /Setting \.src\/\.href\/\.action/,
  },
  {
    name: "setAttribute('src') in act",
    file: 'packages/fill/src/act/x.ts',
    code: "export const f = (el: Element, url: string) => { el.setAttribute('src', url); };",
    expect: /src\/href\/action attribute/,
  },
  {
    name: 'location.href in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const f = () => { location.href = 'https://example.com'; };",
    expect: /Setting \.src\/\.href\/\.action/,
  },
  ...['script', 'iframe', 'link', 'img'].map((tag) => ({
    name: `createElement('${tag}') in act`,
    file: 'packages/fill/src/act/x.ts',
    code: `export const el = document.createElement('${tag}');`,
    expect: /createElement\('script' \| 'iframe' \| 'link' \| 'img'\) loads a URL/,
  })),
  {
    name: 'createElementNS in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const el = document.createElementNS('http://www.w3.org/2000/svg', 'script');",
    expect: /builds markup or elements/,
  },
  {
    name: 'dynamic import in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const m = import('https://example.com/x.js');",
    expect: /No import\(\)/,
  },
  {
    name: 'dynamic import of a local module in fill',
    file: 'packages/fill/src/x.ts',
    code: "export const m = import('./y');",
    expect: /No import\(\)/,
  },
  {
    name: 'window.open in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const w = window.open('https://example.com');",
    expect: /window\.open loads a URL/,
  },
  {
    name: 'open() as a global in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const w = open('https://example.com');",
    expect: /open\(\) \(window\.open\) loads a URL/,
  },
  {
    name: "open through a frame's view in fill",
    file: 'packages/fill/src/x.ts',
    code: "export const f = (el: Element) => el.ownerDocument.defaultView?.open('https://example.com');",
    expect: /\.open opens a URL/,
  },
  {
    name: 'sendBeacon through window.navigator',
    file: 'packages/extension/src/entrypoints/x.content.ts',
    code: "export const r = window.navigator.sendBeacon('https://example.com', '');",
    expect: /sendBeacon is network access/,
  },
  {
    name: 'sendBeacon by destructuring',
    file: 'packages/extension/src/ui/x.ts',
    code: "const { sendBeacon } = navigator;\nexport const r = sendBeacon.call(navigator, 'https://example.com');",
    expect: /sendBeacon is network access/,
  },
  {
    name: 'WebSocket in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const s = new WebSocket('wss://example.com');",
    expect: /WebSocket is network access/,
  },
  {
    name: 'EventSource on globalThis in the extension',
    file: 'packages/extension/src/ui/x.ts',
    code: "export const s = new globalThis.EventSource('https://example.com');",
    expect: /EventSource is network access/,
  },
  {
    name: 'XMLHttpRequest in the helper',
    file: 'packages/helper/src/x.ts',
    code: 'export const x = new XMLHttpRequest();',
    expect: /XMLHttpRequest is network access/,
  },
  {
    name: "WebSocket from a frame's view in fill",
    file: 'packages/fill/src/x.ts',
    code: "export const f = (el: Element) => new (el.ownerDocument.defaultView!.WebSocket)('wss://example.com');",
    expect: /WebSocket is network access/,
  },
  {
    name: 'indexedDB.open in the extension',
    file: 'packages/extension/src/storage/x.ts',
    code: "export const r = indexedDB.open('employ-me', 1);",
    expect: null,
  },
  // No chrome.* in core or fill
  {
    name: 'chrome global in core',
    file: 'packages/core/src/x.ts',
    code: 'export const id = chrome.runtime.id;',
    expect: /No chrome\.\* here/,
  },
  {
    name: 'wxt import in fill',
    file: 'packages/fill/src/x.ts',
    code: "import { browser } from 'wxt/browser';\nexport { browser };",
    expect: /no chrome\.\* or WXT/,
  },
  {
    name: 'chrome in the extension',
    file: 'packages/extension/src/x.ts',
    code: 'export const id = chrome.runtime.id;',
    expect: null,
  },
  {
    name: 'chrome through globalThis in core',
    file: 'packages/core/src/x.ts',
    code: 'const g: { chrome?: { runtime: { id: string } } } = globalThis;\nexport const id = g.chrome?.runtime.id;',
    expect: /No globalThis here/,
  },
  {
    name: 'chrome through globalThis in fill',
    file: 'packages/fill/src/x.ts',
    code: 'const g: { chrome?: { runtime: { id: string } } } = globalThis;\nexport const id = g.chrome?.runtime.id;',
    expect: /No chrome\.\* here, on any object/,
  },
  {
    name: 'chrome on window in fill',
    file: 'packages/fill/src/x.ts',
    code: "export const c: unknown = window['chrome'];",
    expect: /No window here/,
  },
  {
    name: "chrome through a frame's view in fill",
    file: 'packages/fill/src/x.ts',
    code: 'export const c = (el: Element): unknown => Object(el.ownerDocument.defaultView).chrome;',
    expect: /No chrome\.\* here, on any object/,
  },
  {
    name: 'browser by destructuring self in core',
    file: 'packages/core/src/x.ts',
    code: 'export const { browser: b } = Object(self);',
    expect: /No self here/,
  },
  {
    name: "a frame's view, for reading, in fill",
    file: 'packages/fill/src/dom/x.ts',
    code: 'export const f = (el: Element) => el.ownerDocument.defaultView?.getComputedStyle(el).display;',
    expect: null,
  },
  {
    name: 'globalThis in the extension',
    file: 'packages/extension/src/background/x.ts',
    code: 'export const f = (hooks: object) => Object.assign(globalThis, hooks);',
    expect: null,
  },
  // The helper may not see Self-ID types
  {
    name: 'helper importing the full core',
    file: 'packages/helper/src/x.ts',
    code: "import type { SelfIdAnswers } from '@employ-me/core';\nexport type T = SelfIdAnswers;",
    expect: /only '@employ-me\/core\/protocol'/,
  },
  {
    name: 'helper deep-importing self-id',
    file: 'packages/helper/src/x.ts',
    code: "import type { SelfIdAnswers } from '../../core/src/profile/self-id';\nexport type T = SelfIdAnswers;",
    expect: /No deep imports into core/,
  },
  {
    name: 'helper importing the protocol',
    file: 'packages/helper/src/x.ts',
    code: "import type { HelperRequest } from '@employ-me/core/protocol';\nexport type T = HelperRequest;",
    expect: null,
  },
  {
    name: 'console in the helper',
    file: 'packages/helper/src/host/x.ts',
    code: "console.log('hello');",
    expect: /Native Messaging channel/,
  },
  {
    name: 'process.stdout in the host',
    file: 'packages/helper/src/host/x.ts',
    code: "process.stdout.write('hello');",
    expect: /Native Messaging channel/,
  },
  {
    name: 'process.stdout in a stub CLI for helper tests',
    file: 'packages/helper/test/stubs/x.mjs',
    code: "process.stdout.write('{}');",
    expect: null,
  },
  {
    name: 'network access in a stub CLI for helper tests',
    file: 'packages/helper/test/stubs/x.mjs',
    code: "import http from 'node:http';\nexport const h = http;",
    expect: /Network library/,
  },
  // The Provider boundary inside core
  {
    name: 'provider boundary importing self-id',
    file: 'packages/core/src/provider/x.ts',
    code: "export { selfIdAnswersSchema } from '../profile/self-id';",
    expect: /whitelisted Profile pieces/,
  },
  {
    name: 'protocol importing the whole Profile',
    file: 'packages/core/src/protocol/x.ts',
    code: "export { profileSchema } from '../profile';",
    expect: /whitelisted Profile pieces/,
  },
  {
    name: 'protocol importing Snapshots',
    file: 'packages/core/src/protocol/x.ts',
    code: "export { snapshotSchema } from '../tracking/snapshot';",
    expect: /whitelisted Profile pieces/,
  },
  {
    name: 'provider boundary importing a whitelisted piece',
    file: 'packages/core/src/provider/x.ts',
    code: "export { backgroundSchema } from '../profile/background';",
    expect: null,
  },
  // No eval anywhere
  {
    name: 'eval in the extension',
    file: 'packages/extension/src/x.ts',
    code: "export const r: unknown = eval('1');",
    expect: /No eval/,
  },
  {
    name: 'new Function in the helper',
    file: 'packages/helper/src/x.ts',
    code: "export const f = new Function('return 1');",
    expect: /No Function constructor/,
  },
];

describe('boundary lint rules', () => {
  it.each(cases)('$name', async ({ file, code, expect: expected }) => {
    const errors = await boundaryErrors(file, code);
    if (expected === null) {
      expect(errors).toEqual([]);
    } else {
      expect(
        errors.some((message) => expected.test(message)),
        errors.join('\n'),
      ).toBe(true);
    }
  });

  it('cannot be switched off with an inline comment', async () => {
    const errors = await boundaryErrors(
      'packages/fill/src/x.ts',
      '// eslint-disable-next-line no-restricted-syntax\nexport const f = (el: HTMLElement) => el.click();',
    );
    expect(errors.join('\n')).toMatch(/Raw \.click\(\) is banned/);
  });

  it('points every boundary message at the design', async () => {
    const errors = await boundaryErrors(
      'packages/fill/src/x.ts',
      'export const f = (el: HTMLElement) => el.click();',
    );
    expect(errors.join('\n')).toMatch(/design\.md/);
  });
});
