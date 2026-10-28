// @ts-check
// Boundary rules that enforce docs/design.md. Each message says why and where
// the rule comes from. If one blocks you, fix the design or the rule in a
// reviewed change; never disable it inline (CLAUDE.md "Hard rules").
//
// Gotcha: in flat config, a later object's `no-restricted-*` setting REPLACES
// an earlier one for the same file; it does not merge. That is why every
// scope below builds its complete list from the parts, and scopes never
// overlap (see `ignores`).

const DESIGN = 'docs/design.md';

const ACT_WHY = `Only packages/fill/src/act/ may write to the DOM or dispatch events, and act/ refuses Submit/Next/Apply/Send so the user always submits (${DESIGN} "What it is"; research §8 "Assistant vs. bot"). Use the act/ API; if it lacks an operation, add one there behind its guard.`;

/** Raw DOM writes and synthetic events. Allowed only in fill/src/act/ (and tests). */
const DOM_WRITE_SYNTAX = [
  {
    selector: "CallExpression[callee.property.name='click']",
    message: `Raw .click() is banned. ${ACT_WHY}`,
  },
  {
    selector: "CallExpression[callee.property.name='dispatchEvent']",
    message: `Raw dispatchEvent() is banned. ${ACT_WHY}`,
  },
  {
    selector:
      "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(value|files|checked|selected|selectedIndex|indeterminate)$/]",
    message: `Assigning .value/.files/.checked/.selected is a DOM write. ${ACT_WHY}`,
  },
  {
    selector: "CallExpression[callee.object.name='Object'][callee.property.name='getOwnPropertyDescriptor']",
    message: `The prototype value-setter trick (research §5) is a DOM write. ${ACT_WHY}`,
  },
  {
    selector: "CallExpression[callee.object.name='Reflect'][callee.property.name='set']",
    message: `Reflect.set is a way around the DOM-write ban. ${ACT_WHY}`,
  },
];

/** Submitting a form, by any route. Banned everywhere, act/ included. */
const SUBMIT_SYNTAX = [
  {
    selector: 'CallExpression[callee.property.name=/^(submit|requestSubmit)$/]',
    message: `employ-me never submits a form. You review the Fill and click Submit yourself (${DESIGN} "What it is").`,
  },
];

const EVAL_WHY = `MV3 bans remote code, and LLM output is data, never code (research §5 "Remote code ban").`;
const EVAL_GLOBALS = [
  { name: 'eval', message: `No eval. ${EVAL_WHY}` },
  { name: 'Function', message: `No Function constructor. ${EVAL_WHY}` },
];

const NETWORK_WHY = `Zero telemetry: traffic goes only to the job site, its public job APIs and your Provider through the helper (${DESIGN} "Your data stays on your machine"). The one allowed network module is packages/extension/src/net/ats-public-api.ts.`;
const NETWORK_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'importScripts',
].map((name) => ({ name, message: `${name} is network access. ${NETWORK_WHY}` }));
const NETWORK_PROPERTIES = [
  ...['window', 'globalThis', 'self'].flatMap((object) =>
    ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((property) => ({
      object,
      property,
      message: `${object}.${property} is network access. ${NETWORK_WHY}`,
    })),
  ),
  { object: 'navigator', property: 'sendBeacon', message: `sendBeacon is telemetry. ${NETWORK_WHY}` },
];
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

const CHROME_WHY = `core and fill must run anywhere (unit tests, other browsers, a future API-key Provider): no chrome.* or WXT. Put extension wiring in packages/extension (${DESIGN} "Tech").`;
const CHROME_GLOBALS = [
  { name: 'chrome', message: `No chrome.* here. ${CHROME_WHY}` },
  { name: 'browser', message: `No browser.* here. ${CHROME_WHY}` },
];
const CHROME_IMPORT_PATTERNS = [
  { group: ['wxt', 'wxt/*', '@wxt-dev/*', 'webextension-polyfill'], message: CHROME_WHY },
];

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
      'Only the entry points (src/host.ts, src/cli.ts) and src/host/framing.ts may touch stdout: it is the Native Messaging channel.',
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

/**
 * @param {{
 *   syntax?: unknown[], globals?: unknown[], properties?: unknown[],
 *   paths?: unknown[], patterns?: unknown[]
 * }} parts
 */
function rules({ syntax = [], globals = [], properties = [], paths = [], patterns = [] }) {
  return {
    'no-restricted-syntax': ['error', ...syntax],
    'no-restricted-globals': ['error', ...EVAL_GLOBALS, ...globals],
    'no-restricted-properties': ['error', ...properties],
    'no-restricted-imports': ['error', { paths: [...NETWORK_IMPORTS, ...paths], patterns }],
  };
}

const TESTS = ['**/*.test.ts', '**/*.test.tsx'];

/**
 * One scope = one set of files with one complete rule set. Tests in a scope
 * get the same rules minus the DOM-write and submit bans: they may set up
 * DOM state and simulate the user's own clicks.
 *
 * @param {string} name
 * @param {string[]} files
 * @param {string[]} ignores
 * @param {{ domWrites: boolean, submit: boolean, network: boolean, chrome: boolean,
 *   paths?: unknown[], patterns?: unknown[], testPatterns?: unknown[],
 *   globals?: unknown[], properties?: unknown[] }} options
 */
function scope(name, files, ignores, options) {
  const build = (/** @type {boolean} */ isTest) =>
    rules({
      syntax: [
        ...(options.domWrites && !isTest ? DOM_WRITE_SYNTAX : []),
        ...(options.submit && !isTest ? SUBMIT_SYNTAX : []),
      ],
      globals: [
        ...(options.network ? NETWORK_GLOBALS : []),
        ...(options.chrome ? CHROME_GLOBALS : []),
        ...(options.globals ?? []),
      ],
      properties: [...(options.network ? NETWORK_PROPERTIES : []), ...(options.properties ?? [])],
      paths: options.paths ?? [],
      patterns: [
        ...(options.chrome ? CHROME_IMPORT_PATTERNS : []),
        ...((isTest ? options.testPatterns : undefined) ?? options.patterns ?? []),
      ],
    });
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
const HELPER_STDOUT_ALLOWED = [
  'packages/helper/src/host/framing.ts',
  'packages/helper/src/host.ts',
  'packages/helper/src/cli.ts',
];

const all = { domWrites: true, submit: true, network: true };

export const boundaryConfigs = [
  ...scope('core', ['packages/core/**'], CORE_BOUNDARY, { ...all, chrome: true, patterns: DIRECTION.core }),
  ...scope('core-provider-boundary', CORE_BOUNDARY, [], {
    ...all,
    chrome: true,
    patterns: [...DIRECTION.core, ...CORE_BOUNDARY_PATTERNS],
    // The boundary's own tests build a full Profile to prove nothing leaks.
    testPatterns: DIRECTION.core,
  }),
  ...scope('fill', ['packages/fill/**'], ACT, { ...all, chrome: true, patterns: DIRECTION.fill }),
  ...scope('fill-act', ACT, [], { ...all, domWrites: false, chrome: true, patterns: DIRECTION.fill }),
  ...scope('helper', ['packages/helper/**'], HELPER_STDOUT_ALLOWED, {
    ...all,
    chrome: true,
    globals: HELPER_CONSOLE,
    properties: HELPER_STDOUT,
    paths: HELPER_IMPORT_PATHS,
    patterns: HELPER_IMPORT_PATTERNS,
  }),
  ...scope('helper-stdout', HELPER_STDOUT_ALLOWED, [], {
    ...all,
    chrome: true,
    globals: HELPER_CONSOLE,
    paths: HELPER_IMPORT_PATHS,
    patterns: HELPER_IMPORT_PATTERNS,
  }),
  ...scope('extension', ['packages/extension/**'], NET_MODULE, {
    ...all,
    chrome: false,
    patterns: DIRECTION.extension,
  }),
  ...scope('extension-net', NET_MODULE, [], {
    ...all,
    network: false,
    chrome: false,
    patterns: DIRECTION.extension,
  }),
];
