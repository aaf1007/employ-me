// @ts-check
// Boundary rules that enforce docs/design.md. Each message says why and where
// the rule comes from. If one blocks you, fix the design or the rule in a
// reviewed change; never disable it inline (CLAUDE.md "Hard rules").
//
// Gotcha: in flat config, a later object's `no-restricted-*` setting REPLACES
// an earlier one for the same file; it does not merge. That is why every
// scope below builds its complete list from the parts, and scopes never
// overlap (see `ignores`).
//
// Names are matched however they are spelled: `no-restricted-properties`
// with a property alone matches `x.name`, `x['name']`, `` x[`name`] ``,
// `X.prototype.name.call(x)` and `const { name } = x`, on any object. Where a
// rule can say what is allowed instead of listing what isn't, it does:
// fill writes no computed key outside act/, act/ dispatches only events built
// in place, core and fill never touch the global object, Object.assign fills
// only a new object literal.

const DESIGN = 'docs/design.md';

/** An esquery regex matching exactly these names. */
const exactly = (/** @type {readonly string[]} */ list) => `/^(${list.join('|')})$/`;

/** Every place a member expression can be written to. */
const ASSIGNMENT_TARGET = `:matches(${[
  'AssignmentExpression > MemberExpression.left',
  'UpdateExpression > MemberExpression.argument',
  'ObjectPattern > Property > MemberExpression.value',
  'ArrayPattern > MemberExpression',
  'AssignmentPattern > MemberExpression.left',
  'RestElement > MemberExpression',
  'ForInStatement > MemberExpression.left',
  'ForOfStatement > MemberExpression.left',
].join(', ')})`;

/** A write to any of these properties: `x.name =`, `x['name'] =`, `` x[`name`] = ``, `x.name++`, `[x.name] = …`. */
function assignmentTo(/** @type {readonly string[]} */ list) {
  const re = exactly(list);
  return `${ASSIGNMENT_TARGET}:matches([computed=false][property.name=${re}], [property.value=${re}], [property.quasis.0.value.cooked=${re}])`;
}

/**
 * @param {readonly string[]} list
 * @param {(name: string) => string} message
 */
const anyObject = (list, message) => list.map((property) => ({ property, message: message(property) }));

// ------------------------------------------------------------ DOM writes

const ACT_WHY = `Only packages/fill/src/act/ may write to the DOM or dispatch events, and act/ refuses Submit/Next/Apply/Send so the user always submits (${DESIGN} "What it is"; research §8 "Assistant vs. bot"). Use the act/ API; if it lacks an operation, add one there behind its guard.`;

/** Methods that change the page or fire events. Banned outside act/ however they are reached. */
const DOM_WRITE_METHODS = [
  'click',
  'dispatchEvent',
  'setAttribute',
  'setAttributeNS',
  'setAttributeNode',
  'setAttributeNodeNS',
  'toggleAttribute',
  'removeAttribute',
  'removeAttributeNS',
  'removeAttributeNode',
  'insertAdjacentElement',
  'insertAdjacentText',
  'execCommand',
  'setRangeText',
  'showPicker',
  'stepUp',
  'stepDown',
  'attachShadow',
  '__defineSetter__',
  '__lookupSetter__',
];

/** Element state that assignment changes. Reading these is fine. */
const DOM_WRITE_PROPERTIES = [
  'value',
  'defaultValue',
  'files',
  'checked',
  'defaultChecked',
  'selected',
  'defaultSelected',
  'selectedIndex',
  'indeterminate',
  'textContent',
  'innerText',
  'outerText',
  'nodeValue',
];

/** Outside act/ (and tests), everywhere. */
const DOM_WRITE = {
  syntax: [
    {
      selector: assignmentTo(DOM_WRITE_PROPERTIES),
      message: `Assigning .value/.files/.checked/.selected/.textContent (by any spelling of the key) is a DOM write. ${ACT_WHY}`,
    },
    {
      selector:
        "CallExpression[callee.object.name='Object'][callee.property.name='assign']:not([arguments.0.type='ObjectExpression'], [arguments.0.name='globalThis'])",
      message: `Object.assign may fill only a new object literal: Object.assign(el, { value }) is a DOM write. Merge objects with spread. ${ACT_WHY}`,
    },
  ],
  globals: [
    {
      name: 'Reflect',
      message: `Reflect (set, apply, defineProperty) is a way around the DOM-write ban. ${ACT_WHY}`,
    },
  ],
  properties: [
    ...anyObject(
      DOM_WRITE_METHODS,
      (name) =>
        `Raw .${name}() is banned, however it is reached (el['${name}'](), a prototype's .call, destructuring). ${ACT_WHY}`,
    ),
    ...['getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'defineProperty', 'defineProperties'].map(
      (property) => ({
        object: 'Object',
        property,
        message: `The prototype value-setter trick (research §5) is a DOM write: Object.${property} reaches native setters. ${ACT_WHY}`,
      }),
    ),
  ],
};

const READ_ONLY_WHY = `Outside act/, fill and the extension's content script only read the job site's page, and nothing is injected into it (CODING_STANDARDS.md "DOM"). ${ACT_WHY}`;

/** fill outside act/: the page is read-only. */
const READ_ONLY_DOM = {
  syntax: [
    {
      selector: `${ASSIGNMENT_TARGET}[computed=true]`,
      message: `Outside act/, fill writes nothing through a computed key (x[key] = v): lint can't tell it from el['value'] = v. Build objects with Object.fromEntries, or use a Map. ${READ_ONLY_WHY}`,
    },
  ],
  properties: anyObject(
    [
      'focus',
      'blur',
      'select',
      'append',
      'prepend',
      'appendChild',
      'insertBefore',
      'replaceChild',
      'replaceChildren',
      'replaceWith',
      'before',
      'after',
      'remove',
      'removeChild',
      'scrollIntoView',
      'showModal',
      'requestFullscreen',
      'animate',
      'style',
      'classList',
      'dataset',
      'setProperty',
    ],
    (name) => `.${name} changes the page. ${READ_ONLY_WHY}`,
  ),
};

/** All of fill, act/ included: methods are called by name. */
const COMPUTED_CALLS = [
  {
    selector: 'CallExpression > MemberExpression.callee[computed=true]',
    message: `fill calls no method through a computed key (x[name]()): it could be submit() or click() under a name lint can't see. Call methods by name (${DESIGN} "What it is").`,
  },
];

// ------------------------------------------------------------- injection

const INJECTION_WHY = `Nothing is injected into job sites' pages, and markup or elements built in code can load URLs or run script (CODING_STANDARDS.md "DOM"; ${DESIGN} "Your data stays on your machine"). The extension's own pages render through React.`;

/** Everywhere but tests, act/ included. */
const INJECTION = {
  syntax: [
    {
      selector: assignmentTo(['innerHTML', 'outerHTML', 'srcdoc']),
      message: `Assigning HTML is injection. ${INJECTION_WHY}`,
    },
    {
      selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
      message: `Raw HTML is injection. ${INJECTION_WHY}`,
    },
  ],
  properties: [
    ...anyObject(
      [
        'insertAdjacentHTML',
        'createContextualFragment',
        'setHTMLUnsafe',
        'parseHTMLUnsafe',
        'createElement',
        'createElementNS',
      ],
      (name) =>
        `.${name} builds markup or elements (createElement('script' | 'iframe' | 'link' | 'img') loads a URL). ${INJECTION_WHY}`,
    ),
    ...['write', 'writeln', 'open'].map((property) => ({
      object: 'document',
      property,
      message: `document.${property} writes markup. ${INJECTION_WHY}`,
    })),
  ],
};

// ---------------------------------------------------------------- submit

const SUBMIT_WHY = `employ-me never submits a form. You review the Fill and click Submit yourself (${DESIGN} "What it is").`;

/** Everywhere but tests, act/ included. */
const SUBMIT = {
  syntax: [
    {
      selector:
        'NewExpression:matches([arguments.0.value=/^submit$/i], [arguments.0.quasis.0.value.cooked=/^submit$/i])',
      message: `A 'submit' event submits the form as far as the page knows. ${SUBMIT_WHY}`,
    },
  ],
  globals: [
    { name: 'SubmitEvent', message: `SubmitEvent submits the form as far as the page knows. ${SUBMIT_WHY}` },
  ],
  properties: anyObject(
    ['submit', 'requestSubmit', 'SubmitEvent', 'createEvent', 'initEvent'],
    (name) =>
      `.${name} is banned however it is reached (form['${name}'](), a prototype's .call, destructuring): it submits a form or builds an event of any type. ${SUBMIT_WHY}`,
  ),
};

/** act/ only. The one place events are dispatched; each must be built in place, with its type in plain sight. */
const ACT_EVENTS = [
  {
    selector:
      "CallExpression[callee.property.name='dispatchEvent']:not([arguments.0.type='NewExpression'][arguments.0.arguments.0.type='Literal'])",
    message: `act/ dispatches only events built in place with a literal type, el.dispatchEvent(new Event('input', …)), so review and lint can see none is 'submit'. ${SUBMIT_WHY}`,
  },
];

// --------------------------------------------------------------- network

const NETWORK_WHY = `Zero telemetry: traffic goes only to the job site, its public job APIs and your Provider through the helper (${DESIGN} "Your data stays on your machine"). The one allowed network module is packages/extension/src/net/ats-public-api.ts, and it may only fetch().`;

const NETWORK_NAMES = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'importScripts',
];

/** @param {boolean} allowFetch */
const network = (allowFetch) => {
  const names = NETWORK_NAMES.filter((name) => !allowFetch || name !== 'fetch');
  return {
    globals: names.map((name) => ({ name, message: `${name} is network access. ${NETWORK_WHY}` })),
    properties: anyObject(
      [...names, 'sendBeacon'],
      (name) =>
        `.${name} is network access, on any object (window, self, a frame's view, navigator). ${NETWORK_WHY}`,
    ),
  };
};

const NETWORK_IMPORTS = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dgram',
  'undici',
  'axios',
  'ky',
  'ofetch',
  'got',
  'node-fetch',
  'cross-fetch',
].map((name) => ({ name, message: `Network library. ${NETWORK_WHY}` }));

const NETWORK_ATTRIBUTES = ['src', 'srcset', 'href', 'action', 'formAction', 'poster', 'ping'];
const WINDOWS = ['window', 'globalThis', 'self', 'top', 'parent', 'frames', 'opener'];

/** Network access that only exists in a browser. core, fill and the extension, the net module included. */
const BROWSER_NETWORK = {
  syntax: [
    {
      selector: 'ImportExpression',
      message: `No import(): in a content script it loads from the job site, and MV3 bans remote code (research §5 "Remote code ban"). Import statically. ${NETWORK_WHY}`,
    },
    {
      selector: assignmentTo(NETWORK_ATTRIBUTES),
      message: `Setting .src/.href/.action makes the page load that URL (new Image().src is a beacon). ${NETWORK_WHY}`,
    },
    {
      selector: `CallExpression[callee.property.name=/^setAttribute(NS)?$/]:matches([arguments.0.value=/^(${NETWORK_ATTRIBUTES.join('|')}|xlink:href|data)$/i], [arguments.1.value=/^(${NETWORK_ATTRIBUTES.join('|')}|xlink:href|data)$/i])`,
      message: `Setting a src/href/action attribute makes the page load that URL. ${NETWORK_WHY}`,
    },
    {
      selector: "AssignmentExpression > Identifier.left[name='location']",
      message: `Assigning location navigates to a URL. ${NETWORK_WHY}`,
    },
  ],
  globals: ['Image', 'Audio', 'Worker', 'SharedWorker', 'open'].map((name) => ({
    name,
    message: `${name === 'open' ? 'open() (window.open)' : name} loads a URL. ${NETWORK_WHY}`,
  })),
  properties: [
    ...anyObject(
      ['Image', 'Audio', 'Worker', 'SharedWorker'],
      (name) => `${name} loads a URL. ${NETWORK_WHY}`,
    ),
    ...WINDOWS.map((object) => ({
      object,
      property: 'open',
      message: `${object}.open loads a URL. ${NETWORK_WHY}`,
    })),
    ...['assign', 'replace'].map((property) => ({
      object: 'location',
      property,
      message: `location.${property} navigates to a URL. ${NETWORK_WHY}`,
    })),
  ],
};

// ------------------------------------------------------------ eval, chrome

const EVAL_WHY = `MV3 bans remote code, and LLM output is data, never code (research §5 "Remote code ban").`;
const EVAL = {
  globals: [
    { name: 'eval', message: `No eval. ${EVAL_WHY}` },
    { name: 'Function', message: `No Function constructor. ${EVAL_WHY}` },
  ],
  properties: [{ property: 'eval', message: `No eval, on any object. ${EVAL_WHY}` }],
};

const CHROME_WHY = `core and fill must run anywhere (unit tests, other browsers, a future API-key Provider): no chrome.* or WXT. Put extension wiring in packages/extension (${DESIGN} "Tech").`;

/** core, fill and the helper. */
const CHROME = {
  globals: [
    { name: 'chrome', message: `No chrome.* here. ${CHROME_WHY}` },
    { name: 'browser', message: `No browser.* here. ${CHROME_WHY}` },
  ],
};
const CHROME_IMPORT_PATTERNS = [
  { group: ['wxt', 'wxt/*', '@wxt-dev/*', 'webextension-polyfill'], message: CHROME_WHY },
];

/**
 * core and fill name each global they use, so chrome.*, fetch and open can't
 * be reached through the global object (`const g: { chrome?: X } = globalThis`)
 * or a frame's view (`el.ownerDocument.defaultView.chrome`).
 */
const GLOBAL_OBJECT = {
  globals: [
    ...WINDOWS.map((name) => ({
      name,
      message: `No ${name} here: the global object reaches chrome.*, fetch and open by other names. Use the global you need by name, or the element's own document. ${CHROME_WHY}`,
    })),
  ],
  properties: [
    ...anyObject(
      ['chrome', 'browser'],
      (name) => `No ${name}.* here, on any object (globalThis, a frame's view). ${CHROME_WHY}`,
    ),
    { property: 'open', message: `.open opens a URL (window.open), on any object. ${NETWORK_WHY}` },
  ],
};

// ------------------------------------------------- Provider boundary, helper

const SELF_ID_WHY = `Self-ID Answers and Attestations never go to a Provider (${DESIGN} "Sensitive questions").`;

/** packages/core/src/provider and /protocol define what a Provider can receive. */
const CORE_BOUNDARY_PATTERNS = [
  {
    // Any relative import of profile/* other than the whitelisted pieces, and
    // anything from tracking/ (Snapshots hold submitted Self-ID Answers).
    regex: '^(\\.\\./)+(profile(?!/(background|identity|resume|saved-answer)$)(/.*)?|tracking(/.*)?|index)$',
    message: `The Provider boundary may only use whitelisted Profile pieces (identity, background, resume, saved-answer). ${SELF_ID_WHY}`,
  },
];

const HELPER_IMPORT_PATHS = [
  {
    name: '@employ-me/core',
    message: `The helper may import only '@employ-me/core/protocol', which excludes the Profile and Self-ID types. ${SELF_ID_WHY}`,
  },
];
const HELPER_IMPORT_PATTERNS = [
  {
    group: ['@employ-me/core/*', '!@employ-me/core/protocol'],
    message: `The helper may import only '@employ-me/core/protocol'. ${SELF_ID_WHY}`,
  },
  {
    group: ['**/core/src/**', '**/self-id*'],
    message: `No deep imports into core from the helper. ${SELF_ID_WHY}`,
  },
  {
    group: ['@employ-me/fill', '@employ-me/extension'],
    message: 'The helper is a separate program; it shares only the protocol with the extension.',
  },
];

const HELPER_CONSOLE = [
  {
    name: 'console',
    message:
      'stdout is the Native Messaging channel: console output corrupts it. Use the Logger (src/log/logger.ts), which never logs Profile values; CLI commands print through CliIo.',
  },
];
const HELPER_STDOUT = [
  {
    object: 'process',
    property: 'stdout',
    message:
      'Only the entry points (src/host.ts, src/cli.ts) may touch process.stdout: it is the Native Messaging channel. The host writes frames to the stream runHost is given; CLI commands print through CliIo.',
  },
];

const DIRECTION = {
  core: [
    {
      group: ['@employ-me/fill', '@employ-me/extension', 'employ-me'],
      message: 'core depends on nothing else in the repo.',
    },
  ],
  fill: [{ group: ['@employ-me/extension', 'employ-me'], message: 'fill depends only on core.' }],
  extension: [
    {
      group: ['employ-me', '**/packages/helper/**'],
      message: 'The extension reaches the helper only over Native Messaging (ADR-0001).',
    },
  ],
};

// ---------------------------------------------------------------- scopes

/**
 * @typedef {{ syntax?: unknown[], globals?: unknown[], properties?: unknown[] }} Group
 */

/**
 * @param {Group[]} groups
 * @param {{ paths?: unknown[], patterns?: unknown[] }} imports
 */
function rules(groups, { paths = [], patterns = [] }) {
  return {
    'no-restricted-syntax': ['error', ...groups.flatMap((g) => g.syntax ?? [])],
    'no-restricted-globals': ['error', ...groups.flatMap((g) => g.globals ?? [])],
    'no-restricted-properties': ['error', ...groups.flatMap((g) => g.properties ?? [])],
    'no-restricted-imports': ['error', { paths: [...NETWORK_IMPORTS, ...paths], patterns }],
  };
}

// Test support (fixture builders) is test code too: it sets up DOM state.
const TESTS = ['**/*.test.ts', '**/*.test.tsx', 'packages/*/src/test-support/**'];

/**
 * One scope = one set of files with one complete rule set. Tests in a scope
 * get the same rules minus the DOM-write, injection and submit bans: they
 * may set up DOM state and simulate the user's own clicks. Network, eval and
 * chrome rules apply to tests too.
 *
 * @param {string} name
 * @param {string[]} files
 * @param {string[]} ignores
 * @param {{ domWrites: boolean, network: boolean, chrome: boolean, browser: boolean,
 *   globalObject?: boolean, readOnlyDom?: boolean, computedCalls?: boolean, actEvents?: boolean, allowFetch?: boolean,
 *   paths?: unknown[], patterns?: unknown[], testPatterns?: unknown[],
 *   globals?: unknown[], properties?: unknown[] }} options
 */
function scope(name, files, ignores, options) {
  const build = (/** @type {boolean} */ isTest) => {
    /** @type {Group[]} */
    const groups = [EVAL, { globals: options.globals ?? [], properties: options.properties ?? [] }];
    if (!isTest) {
      groups.push(INJECTION, SUBMIT);
      if (options.domWrites) groups.push(DOM_WRITE);
      if (options.readOnlyDom === true) groups.push(READ_ONLY_DOM);
      if (options.computedCalls === true) groups.push({ syntax: COMPUTED_CALLS });
      if (options.actEvents === true) groups.push({ syntax: ACT_EVENTS });
    }
    if (options.network) groups.push(network(options.allowFetch === true));
    if (options.browser) groups.push(BROWSER_NETWORK);
    if (options.chrome) groups.push(CHROME);
    if (options.globalObject === true) groups.push(GLOBAL_OBJECT);
    return rules(groups, {
      paths: options.paths ?? [],
      patterns: [
        ...(options.chrome ? CHROME_IMPORT_PATTERNS : []),
        ...((isTest ? options.testPatterns : undefined) ?? options.patterns ?? []),
      ],
    });
  };
  return [
    { name: `employ-me/boundaries/${name}`, files, ignores: [...ignores, ...TESTS], rules: build(false) },
    {
      name: `employ-me/boundaries/${name}/tests`,
      // A nested array means the file must match every pattern in it.
      files: files.flatMap((pattern) => TESTS.map((test) => [pattern, test])),
      ignores,
      rules: build(true),
    },
  ];
}

const ACT = ['packages/fill/src/act/**'];
const CORE_BOUNDARY = ['packages/core/src/provider/**', 'packages/core/src/protocol/**'];
const NET_MODULE = ['packages/extension/src/net/ats-public-api.ts'];
/** The extension's code that runs inside job sites' pages. */
const CONTENT_SCRIPT = [
  'packages/extension/src/content/**',
  'packages/extension/src/entrypoints/*.content.ts',
];
const HELPER_STDOUT_ALLOWED = [
  'packages/helper/src/host.ts',
  'packages/helper/src/cli.ts',
  // Stand-ins for the claude and codex CLIs in unit tests: separate
  // programs whose stdout is their output, not the Native Messaging channel.
  'packages/helper/test/stubs/**',
];

const all = { domWrites: true, network: true };
const inBrowser = { ...all, browser: true };
const inCoreOrFill = { ...inBrowser, chrome: true, globalObject: true };
const inHelper = {
  ...all,
  browser: false,
  chrome: true,
  globals: HELPER_CONSOLE,
  paths: HELPER_IMPORT_PATHS,
  patterns: HELPER_IMPORT_PATTERNS,
};

export const boundaryConfigs = [
  ...scope('core', ['packages/core/**'], CORE_BOUNDARY, { ...inCoreOrFill, patterns: DIRECTION.core }),
  ...scope('core-provider-boundary', CORE_BOUNDARY, [], {
    ...inCoreOrFill,
    patterns: [...DIRECTION.core, ...CORE_BOUNDARY_PATTERNS],
    // The boundary's own tests build a full Profile to prove nothing leaks.
    testPatterns: DIRECTION.core,
  }),
  ...scope('fill', ['packages/fill/**'], ACT, {
    ...inCoreOrFill,
    readOnlyDom: true,
    computedCalls: true,
    patterns: DIRECTION.fill,
  }),
  ...scope('fill-act', ACT, [], {
    ...inCoreOrFill,
    domWrites: false,
    computedCalls: true,
    actEvents: true,
    patterns: DIRECTION.fill,
  }),
  ...scope('helper', ['packages/helper/**'], HELPER_STDOUT_ALLOWED, {
    ...inHelper,
    properties: HELPER_STDOUT,
  }),
  ...scope('helper-stdout', HELPER_STDOUT_ALLOWED, [], inHelper),
  ...scope('extension', ['packages/extension/**'], [...NET_MODULE, ...CONTENT_SCRIPT], {
    ...inBrowser,
    chrome: false,
    patterns: DIRECTION.extension,
  }),
  // The content script runs in job sites' pages: it reads them like fill and
  // writes only through fill's act/ (outlines included), with no network.
  // It reaches the extension through the imported `browser`, never the global object.
  ...scope('extension-content', CONTENT_SCRIPT, [], {
    ...inBrowser,
    chrome: false,
    readOnlyDom: true,
    computedCalls: true,
    globalObject: true,
    patterns: DIRECTION.extension,
  }),
  ...scope('extension-net', NET_MODULE, [], {
    ...inBrowser,
    allowFetch: true,
    chrome: false,
    patterns: DIRECTION.extension,
  }),
];
