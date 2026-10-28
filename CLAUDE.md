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
| `pnpm test:e2e` | Builds the extension and the helper, then runs Playwright (see below). |
| `pnpm format` | Prettier write, then `eslint --fix`. |
| `pnpm vitest --project <core\|fill\|helper\|extension\|tools>` | Unit tests for one package, in watch mode. |
| `pnpm fill-rate [--write]` | Fill rate per ATS from the recorded fixtures' expected results; `--write` updates the README table. |
| `node tools/fixtures/record.ts <name>\|--all` | Records a live, public Application Form from `e2e/forms.ts` as a HAR fixture. Loads and types only; never submits. |
| `pnpm setup:local` | Builds everything, then runs `employ-me setup` from the repo build: the way to install today, before any npm publish. Writes to the real browser profiles; `node packages/helper/dist/cli.mjs uninstall` undoes it. |
| `pnpm smoke:providers` | Opt-in: one tiny real `mapFields` call to your own `claude` and `codex`, plus their status. Spends a trivial amount of your plan. Never part of `pnpm check`. |

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

The main feedback loop. `pnpm test:e2e` builds the extension, its test build and the helper, and launches Playwright's Chromium with it loaded unpacked, one fresh profile per test.

- Import `{ test, expect }` from `e2e/harness.ts`, not from `@playwright/test`.
- `sites.serve(url, 'greenhouse/<file>.html')` answers a real ATS URL with a file from `fixtures/`, so content-script match patterns apply. Every other http(s) request is aborted and listed in `sites.blocked`.
- `extension.openSidePanel({ forPage })` opens `sidepanel.html?tabId=<id>` in a tab: Playwright can't open Chrome's real side panel, so the page takes its target tab from the query. `extension.openDashboard('tracker')`, `extension.pingContentScripts()`, and `extension.errors` (console errors from extension pages and the service worker) cover the rest.
- Chromium runs with `EMPLOY_ME_PROVIDER=fake`, which a helper started by Chrome inherits, so e2e never spends the user's plan. `playwright.config.ts` sets it in the workers' environment. Don't pass `env` to the launch: Playwright records launch options in trace.zip, every variable and token with them.
- **The real helper in e2e:** `test.use({ helper: 'fake' })` installs the built helper, with the fake Provider forced on, into that test's profile (`${userDataDir}/NativeMessagingHosts/`), so `browser.runtime.connectNative` / `sendNativeMessage` reach the real host. `test.use({ helper: 'fail:providerRateLimited' })` (any `HelperErrorReason`) makes every Provider call fail with that reason. Without it there is no helper: `helperNotInstalled`. Under the hood this runs `employ-me install-test-host --user-data-dir <dir> [--fail <reason>]` (also `installTestHost` in `packages/helper/src/install/test-host.ts`), which writes nothing outside the profile; its log is `${userDataDir}/employ-me-test-host/helper.log`. macOS and Linux only (Windows reads hosts from the registry). See `e2e/helper.spec.ts`.
- **The in-memory helper:** `test.use({ helper: 'inMemory' })` loads the extension's test build (`wxt build --mode e2e`, `.output/chrome-mv3-e2e`) instead, whose background talks to a scriptable stand-in for the helper (`packages/extension/src/helper/in-memory-transport.ts`) rather than Native Messaging. `extension.configureHelper({ installed, failWith, resumeExtract, providers })` scripts it; `extension.helperRequests()` lists what it received. Use it when a spec needs a Resume extract or a Provider state the real fake Provider doesn't produce. Production builds don't contain it.
- **Fill specs** (`e2e/fill.spec.ts`, `e2e/fill-seam.spec.ts`): `sites.replay('<ats>/<name>.har')` replays a recorded form offline with its real JavaScript; `e2e/fill-page.ts` injects the fill engine (bundled from `e2e/fill-bundle/` into `e2e/.build/fill.js`, rebuilt every run, never shipped) into the form's frame and reads values back from the DOM on its own. `e2e/side-requests.ts` answers what a form sends before Submit (S3 uploads, Lever's resume parse, Ashby's autosave) and treats any other write to the form's site as a submission. `UPDATE_FILL_EXPECTED=1` rewrites `fixtures/*/*.expected.json`; review the diff.
- Background messages from a spec: `sendToBackground(page, type, payload)` in `e2e/dashboard.ts`, from any extension page (the side panel's and content script's API, `packages/extension/src/messaging/background.ts`).
- **Wait for state, never for time.** No `waitForTimeout` (lint bans it in `e2e/`, `e2e/live/` aside): wait with a web-first assertion or an event for the state the next step needs. On a busy machine every Fill and re-plan takes longer, and re-plans queue behind each other, so an action taken while one is still in flight races it. Drive the side panel through `e2e/panel.ts`, whose helpers wait for the state each action ends in: `clickFill`, `nextStep(panel, press, firstField)` (you move the form on; waits for the new step and the end of its AI round, since `fill-done` still shows from the step before), `draftReady` (a Draft card says `ready` before its re-plan lands; the field's `needsReview` is the state to wait for) and `acceptDraft`. Edit the page only once the panel is done with it.
- **Check a spec under load** before calling it stable: `E2E_SKIP_BUILD=1 pnpm exec playwright test e2e/<spec>.ts --repeat-each 10`, once as is and once with every core busy: one `yes > /dev/null &` per core the workers leave free (cores minus workers; Playwright's default is half the cores), `pkill yes` after.
- Fast reruns: `E2E_SKIP_BUILD=1 pnpm exec playwright test e2e/<spec>.ts`. Watch it: `HEADED=1`.
- On failure: `test-results/<test>/trace.zip` (`pnpm exec playwright show-trace <zip>`) and a `console.log` attachment.
- Playwright is pinned to 1.63.0 because its Chromium (revision 1243) is cached on this Mac. Bumping it means `pnpm exec playwright install chromium`.
- Playwright does not route the extension service worker's own requests. Keep network calls in the side panel, or mock them in unit tests.

## Logs

- **Helper:** `~/Library/Logs/employ-me/helper.log` on macOS; `$XDG_STATE_HOME/employ-me/helper.log` (default `~/.local/state/…`) on Linux; `%LOCALAPPDATA%\employ-me\Logs\helper.log` on Windows. Defined in `packages/helper/src/log/paths.ts`; `EMPLOY_ME_LOG_FILE` overrides it. JSON lines with the closed `LogEntry` shape: events, request ids and types, Provider, durations, sizes, exit codes, error reasons. Profile values, prompts, Drafts, Resumes and job descriptions are never logged, and neither is CLI output. Rotates at 5 MB.
- `employ-me doctor` checks the install, the host manifests, the extension ID and both CLIs' logins, and prints the config and log paths. The installed helper lives in `~/Library/Application Support/employ-me/` on macOS (`$XDG_DATA_HOME/employ-me` on Linux, `%LOCALAPPDATA%\employ-me` on Windows), with `config.json`, `launcher.sh` and a copy of `dist/`.
- The helper's stdout is the Native Messaging channel, so `console` is lint-banned there, and `host.ts` points the global console at stderr in case a dependency prints. CLI output goes through `CliIo`.
- **Extension:** the service worker console is under chrome://extensions → employ-me → Inspect views. Right-click the side panel → Inspect. e2e captures both.
- Chrome's own Native Messaging errors show when Chrome is started with `--enable-logging=stderr --v=1`.

## Gotchas

- In flat config, a later `no-restricted-*` setting replaces an earlier one; it doesn't merge. Boundary rules are built per scope in `tools/eslint/boundaries.js`, and `tools/eslint/boundaries.test.ts` proves each one fires. Change both together.
- WXT auto-imports are off. Import `browser` from `wxt/browser` and `defineBackground` and friends from `wxt/utils/define-*`.
- TypeScript is pinned to 6.0.x: typescript-eslint supports `<6.1`, even though TS 7 is out.
- pnpm enforces a minimum release age. If it refuses a brand-new version, pin an older one rather than adding an exclusion.
- The extension ID is fixed by the `key` in `packages/extension/src/manifest-key.ts`, and a unit test checks it still matches `EXTENSION_ID`. The private key isn't needed and isn't in the repo.
- core is consumed as TypeScript source (no build step). The helper bundles core, zod and unpdf into `dist/*.mjs` with tsdown (pdf.js is its own chunk, so setup copies all of `dist/`). A new bundled dependency must be added to `deps.onlyBundle` in `packages/helper/tsdown.config.ts`.
- Helper unit tests run stub `claude` and `codex` executables (`packages/helper/test/stubs/`), never the real CLIs. The Codex stub speaks the app-server protocol of codex-cli 0.158.0; when Codex changes, regenerate the types with `codex app-server generate-ts --out <dir>` and compare.
- `codex app-server` has no `--ignore-user-config`, so the Codex Provider switches the user's tools, plugins, skills, hooks and enabled MCP servers off with `-c` overrides (`providers/codex/isolation.ts`) and refuses to run if one can't be. It uses the account's default model from `model/list`, not the one in `~/.codex/config.toml`, which a ChatGPT login may not be allowed to use.
- On macOS `claude` finds its login in the Keychain under `$USER`; with no `USER` it reports "not logged in". The helper fills `USER` in when Chrome didn't pass it.
