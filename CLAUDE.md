# employ-me

A Chrome MV3 extension that fills in job Application Forms from the user's own Profile and keeps a Tracker of Applications, plus a local Native Messaging helper that runs the user's own `claude` or `codex` CLI. The user starts every Fill, reviews it, and clicks Submit themselves.

## The spec

These are decided. Build to them; don't re-decide them.

- [docs/design.md](docs/design.md): every v1 product decision. Read it before any feature work.
- [GLOSSARY.md](GLOSSARY.md): the domain terms. Read it before naming anything.
- [docs/adr/](docs/adr/): why the helper exists (0001), and how Claude may be called (0002). Read them before touching the helper or a Provider.
- [docs/research/2026-10-27-landscape.md](docs/research/2026-10-27-landscape.md): §3.2 CLI flags, §3.3 Native Messaging, §5 MV3 techniques, §6 the field pipeline, §7 tracking and public job APIs. Read the matching section before implementing it.
- [CODING_STANDARDS.md](CODING_STANDARDS.md): the rules review checks. Read it before writing code.
- [docs/BUILD_LOG.md](docs/BUILD_LOG.md): read the latest entries when you start. When you finish, append a short dated entry: what landed, what's left, gotchas.

## Commands

| Command | Does |
|---|---|
| `pnpm check` | Typecheck, ESLint, Prettier check and unit tests across all packages. Green before every commit. |
| `pnpm build` | Extension to `packages/extension/.output/chrome-mv3/`, helper to `packages/helper/dist/`. |
| `pnpm test:e2e` | Builds the extension, then runs Playwright (see below). |
| `pnpm format` | Prettier write, then `eslint --fix`. |
| `pnpm vitest --project <core\|fill\|helper\|extension\|tools>` | Unit tests for one package, in watch mode. |

## Packages

Each later agent owns one package. Work inside it; when you need a change in another package, keep it to the interface you need and say so in your BUILD_LOG entry.

| Package | Path | Holds | May import |
|---|---|---|---|
| `@employ-me/core` | `packages/core` | Domain types with zod schemas (Profile, Resume, Saved Answer, Posting, Application, Snapshot, Status), the field-type taxonomy, label normalization, the helper protocol, the Provider boundary. Pure TS: no DOM, no `chrome.*`. | nothing in the repo |
| `@employ-me/fill` | `packages/fill` | The fill engine, run in content scripts: `extract/`, `classify/`, `act/` (the only DOM writer), `adapters/{greenhouse,lever,ashby,generic}/`, `detect-submission/`, `posting/`. No `chrome.*`. | core |
| `employ-me` (helper) | `packages/helper` | The Native Messaging host, the `employ-me` CLI (`setup`, `doctor`, `uninstall`), the Claude, Codex and fake Providers. | `@employ-me/core/protocol` only |
| `@employ-me/extension` | `packages/extension` | WXT + React 19: background, side panel, dashboard (Profile, Saved Answers, Tracker, Settings), the ATS content script, the one network module. | core, fill |
| e2e and lint rules | `e2e/`, `fixtures/`, `tools/eslint/` | Shared. Adapter owners add fixtures and specs. | |

Contracts shared across packages (domain types, protocol messages, the Provider boundary) change in core, with tests, in their own commit.

## Hard rules

1. **The user submits.** Code fills fields and stops. All DOM writes and events go through `act` from `@employ-me/fill`, whose guard refuses Submit, Next, Apply, Send and sign-in controls. Attestations are left for the user to tick.
2. **Self-ID Answers and Attestations stay on the machine.** Everything sent to a Provider is built by core's `toProviderField`, `toProviderSavedQuestion` and `toDraftContext`. Field mapping carries labels and options only, never Profile values.
3. **The network is the allowlist.** The job site, its public job APIs through `packages/extension/src/net/ats-public-api.ts`, and the Provider through the helper. Nothing else: no telemetry, analytics, CDNs or remote code.
4. **Glossary names.** `Application` is the record of a submission; the form is an Application Form (`form` in code). The glossary's _Avoid_ words stay out of identifiers.
5. **Fix the convention, not the symptom.** When a lint rule, type or convention blocks you, change the rule or convention itself in a reviewed change and note why in BUILD_LOG. Inline `eslint-disable` is switched off repo-wide; an `as` cast, `@ts-expect-error` or `unknown` detour around a boundary is the same bypass.
6. **Every field gets an outcome**: filled, needs review, or couldn't fill with a reason and a fix (core `FieldOutcome`).
7. **Never stored, never filled:** passwords, SIN/SSN, date of birth, references, signatures. No account creation, no CAPTCHAs. LinkedIn and Indeed are never supported.

## End-to-end tests

The main feedback loop. `pnpm test:e2e` builds the extension and launches Playwright's Chromium with it loaded unpacked, one fresh profile per test.

- Import `{ test, expect }` from `e2e/harness.ts`, not from `@playwright/test`.
- `sites.serve(url, 'greenhouse/<file>.html')` answers a real ATS URL with a file from `fixtures/`, so content-script match patterns apply. Every other http(s) request is aborted and listed in `sites.blocked`.
- `extension.openSidePanel({ forPage })` opens `sidepanel.html?tabId=<id>` in a tab: Playwright can't open Chrome's real side panel, so the page takes its target tab from the query. `extension.openDashboard('tracker')`, `extension.pingContentScripts()`, and `extension.errors` (console errors from extension pages and the service worker) cover the rest.
- Chromium runs with `EMPLOY_ME_PROVIDER=fake`, which a helper started by Chrome inherits, so e2e never spends the user's plan. To e2e the helper, write its host manifest into `${userDataDir}/NativeMessagingHosts/` before the context starts (not yet exercised).
- Fast reruns: `E2E_SKIP_BUILD=1 pnpm exec playwright test e2e/<spec>.ts`. Watch it: `HEADED=1`.
- On failure: `test-results/<test>/trace.zip` (`pnpm exec playwright show-trace <zip>`) and a `console.log` attachment.
- Playwright is pinned to 1.63.0 because its Chromium (revision 1243) is cached on this Mac. Bumping it means `pnpm exec playwright install chromium`.
- Playwright does not route the extension service worker's own requests. Keep network calls in the side panel, or mock them in unit tests.

## Logs

- **Helper:** `~/Library/Logs/employ-me/helper.log` on macOS; `$XDG_STATE_HOME/employ-me/helper.log` (default `~/.local/state/…`) on Linux; `%LOCALAPPDATA%\employ-me\Logs\helper.log` on Windows. Defined in `packages/helper/src/log/paths.ts`. JSON lines with the closed `LogEntry` shape: events, request ids, durations, sizes, error reasons. Profile values, Drafts, Resumes and job descriptions are never logged.
- The helper's stdout is the Native Messaging channel, so `console` is lint-banned there. CLI output goes through `CliIo`.
- **Extension:** the service worker console is under chrome://extensions → employ-me → Inspect views. Right-click the side panel → Inspect. e2e captures both.
- Chrome's own Native Messaging errors show when Chrome is started with `--enable-logging=stderr --v=1`.

## Gotchas

- In flat config, a later `no-restricted-*` setting replaces an earlier one; it doesn't merge. Boundary rules are built per scope in `tools/eslint/boundaries.js`, and `tools/eslint/boundaries.test.ts` proves each one fires. Change both together.
- WXT auto-imports are off. Import `browser` from `wxt/browser` and `defineBackground` and friends from `wxt/utils/define-*`.
- TypeScript is pinned to 6.0.x: typescript-eslint supports `<6.1`, even though TS 7 is out.
- pnpm enforces a minimum release age. If it refuses a brand-new version, pin an older one rather than adding an exclusion.
- The extension ID is fixed by the `key` in `packages/extension/src/manifest-key.ts`, and a unit test checks it still matches `EXTENSION_ID`. The private key isn't needed and isn't in the repo.
- core is consumed as TypeScript source (no build step). The helper bundles core and zod into `dist/*.mjs` with tsdown.
