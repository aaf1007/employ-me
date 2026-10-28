# Build log

Every agent appends one short entry when it finishes: date, who/what, what landed, what's left, gotchas. Newest at the bottom. Keep entries short; the code and commit history hold the detail.

## 2026-10-27 · Foundation (environment, no features)

**Landed**
- pnpm monorepo: `core`, `fill`, `helper` (npm name `employ-me`), `extension`. Strict TS (`strict`, `noUncheckedIndexedAccess`), ESLint flat config with typescript-eslint strict-type-checked, Prettier, Vitest, Playwright, CI.
- core: zod schemas for the Profile (exactly as design.md lists it, per-country Work Authorization with `yes|no|ask` sponsorship, per-country Self-ID Answers defaulting to `decline`, strict objects so never-stored data is rejected), Resume metadata, Saved Answer, Posting, Application, Snapshot, Status; the field-type taxonomy (~80 types, each with a sensitivity); label normalization; `FieldOutcome`; the helper protocol (`health`, `mapFields`, `draftAnswer`, `parseResume`, errors with reason and fix); the Provider boundary (strict, branded inputs built only by `toProviderField`, `toProviderSavedQuestion` and `toDraftContext`).
- fill: module layout stubbed. `act/` has a working guard that refuses submit/next/apply/send controls and Attestation/never-stored field types, with tests; its operations are stubs behind it.
- helper: CLI router, a working fake Provider (`EMPLOY_ME_PROVIDER=fake`, `EMPLOY_ME_FAKE_FAIL=<reason>`), log path decided, host manifest builder. Everything else is stubbed.
- extension: WXT + React 19 with background, side panel, dashboard (4 routes) and one ATS content script (Greenhouse/Lever/Ashby hosts, `all_frames`) that answers a `ping`. Fixed `key` gives ID `ippegianaaknpaknfbjblanhbehckehh`. A CSP `connect-src` allowlist ships in built manifests.
- Boundary lint rules in `tools/eslint/boundaries.js`, each one proven by `tools/eslint/boundaries.test.ts`. Inline `eslint-disable` is off repo-wide.
- e2e harness (`e2e/harness.ts`) and smoke tests: fixed extension ID, content script on routed Greenhouse/Lever/Ashby URLs, inside an embedded Greenhouse iframe and not on the host page, side panel and dashboard render with no errors.

**Decisions the docs didn't cover**
- Draft context whitelist: preferred name, links, work history, education, skills, languages, Saved Answers (employer override applied), and the Posting's title, company and description. Contact, address, Work Authorization, salary, screening answers and Self-ID never go.
- `mapFields` gets labels, options and Saved Answer *questions* (never answers). The Provider "chooses an option" by mapping each form option to a canonical vocab value (`taxonomy/vocab.ts`); rules then pick using the Profile value locally.
- What a Provider may pull from a Resume (`ResumeExtract`) leaves out Work Authorization, Self-ID, screening and salary: those come from the questionnaire only.
- Profile sections are optional or defaulted, so a part-done setup saves; missing values become "Couldn't fill: notInProfile".
- Native host name `com.employ_me.helper`. The helper's `package.json` is `private: true` until the first npm publish.
- One content script for all three ATSs; the adapter is picked at runtime from the URL.
- Self-ID vocabularies include `nonBinary` (US sex) and `twoSpirit` (Canadian gender identity), as live forms offer them.

**Left**: everything marked `not implemented`. In rough dependency order: helper framing/dispatch/logger/setup; extension helper client and storage; fill extract/classify/act operations; adapters with real fixtures; posting and submission detection; Tracker and Snapshots; generic fallback injection (`scripting` + optional host permission).

**Gotchas**
- TypeScript 6.0.3, not 7: typescript-eslint supports `<6.1`.
- Playwright 1.63.0 matches the cached Chromium 1243.
- tsdown 0.23.1: 0.23.3 was hours old and pnpm's release-age policy refused it.
- Saved Answers carry no field type, so nothing in the types stops one from being created out of a Self-ID or Attestation field. The fill engine must never do that; consider recording the field type when saving.

## 2026-10-28 · Helper (packages/helper)

**Landed**
- Native Messaging host: native-byte-order framing, Chrome's 1 MB cap (an oversized answer becomes `messageTooLarge`), concurrent requests by id, strict validation (smuggled keys are `boundaryViolation`, values never echoed), `health`/`mapFields`/`draftAnswer`/`parseResume`, every error with a reason and a Provider-specific fix. Closing the port cancels CLI processes and stops Codex.
- Claude Provider: stock `claude -p` with the research §3.2 flags, `ANTHROPIC_API_KEY` stripped, `structured_output` read; not logged in / limit / missing / timeout mapped. Status from `claude --version` and `claude auth status` (only `loggedIn` read).
- Codex Provider: one warm `codex app-server`, protocol checked against `generate-ts` on 0.158.0. Ephemeral read-only thread per task, our `baseInstructions`, `outputSchema` per turn, low effort for `mapFields`, server requests refused. Quota from `account/rateLimits/read` in `health`.
- Provider-agnostic prompts (`src/prompts/`); PDF (unpdf), DOCX (own ZIP reader) and text Resume extraction in the helper.
- `employ-me setup | doctor | uninstall | install-test-host`, `pnpm setup:local`, `pnpm smoke:providers`, the e2e `helper` option and `e2e/helper.spec.ts`.
- Smoke on this Mac, 2026-10-28: claude 2.1.311 and codex 0.158.0 both ready, one-field `mapFields` → `contact.email` in ~5 s each.

**Core changes** (own commit): `confidence` on every mapping; `userDraft` claim support (polish mode); optional `quota` on `ProviderStatus`; `resumeUnreadable` error reason. The fake Provider returns a confidence.

**Lint change** (own commit): `packages/helper/test/stubs/**` may write stdout (they stand in for the CLIs); `framing.ts` no longer may; plain JS gets Node globals.

**Decisions the docs didn't cover**
- The prompt goes to `claude` on stdin, which is then closed, not in argv: argv is visible to other processes and capped in size.
- Codex isolation is `-c` overrides (no `--ignore-user-config` for app-server); enabled MCP servers come from `codex mcp list --json`, and Codex refuses to run when one can't be switched off.
- "Codex: the default model" means the account's catalog default (`model/list`), not `config.toml`'s: this Mac's config names a model a ChatGPT login can't use (`model_not_found`). `models.codex` / `models.claude` in the helper's `config.json` override.
- The host puts the CLI's folder and its own node first on PATH (npm-installed CLIs are `#!/usr/bin/env node`) and fills in `USER` when missing.
- Field mapping returns a flat wire shape (all keys, unused ones null) that both CLIs' structured output accept, converted to core's union; fields the model skipped or got wrong become `unknown`. A Resume extract keeps every valid piece and drops only invalid ones.
- unpdf 1.9.1 added (bundled), for PDF Resume text.

**Left**
- Windows paths (registry, `.cmd` shims, launcher) are written and unit-tested but never run on Windows. Linux is untested beyond CI.
- `npm publish`: ship the built extension in the package (setup looks in `<dist>/../extension`) and set `private: false`.
- Saved Answer questions go to `mapFields` uncapped (up to 5000). Prefilter by word overlap if prompts get big.
- No per-field cache of mappings yet (research §6 step 4, `labelCacheKey`); the extension or helper should add one.

**Gotchas**
- research §10's "can `claude` started by Chrome read the Keychain?": yes, given `USER`, which launchd passes to GUI apps.
- pdf.js prints warnings with `console.log`: keep `verbosity: 0`; `host.ts` also points the console at stderr.
- A `win32` layout of a POSIX temp path is a relative path: one test wrote files into the repo root before it was fixed. Use real local paths in install tests.

## 2026-10-28 · Extension data layer and dashboard (packages/extension)

**Landed**
- Storage: IndexedDB behind a typed `DataStore` (`src/storage/`). The Profile's own fields, Resumes (metadata, plus the file as a Blob), Saved Answers, Applications (Snapshots in their own store, so the Tracker list never loads every job description) and Settings. Every write goes through core's schemas and every read is parsed back; damaged data is `corrupt`, IndexedDB failures `storageFailed`, each with a fix. Writes announce what changed on a BroadcastChannel, so open pages refresh (a Snapshot recorded from the side panel shows up live in the Tracker). Full JSON backup and restore, Resume files included (base64), all-or-nothing.
- Background message API for the side panel and the content script (`src/messaging/background.ts`; call it with `callBackground` from `background-client.ts`). Both directions are parsed, and each message says who may send it:
  - Pages and content scripts: `profile.get`, `settings.get`, `resumes.getFile {resumeId?}` (base64), `applications.findByPosting {key}`, `applications.recordSubmission {source, posting, snapshot}`, `savedAnswers.saveAcceptedDraft {question, answer, fieldType, employer?}`.
  - Extension pages only, so a job site can't spend your plan: `helper.health`, `helper.parseResume {resumeId?}`, `helper.mapFields {input}`, `helper.draftAnswer {input}`. Provider and model come from Settings; `input` must be built with core's `to*` functions (the request type is the schema's branded output).
- Helper client (`src/helper/`): `connectNative` behind `HelperTransport`. One warm port, ids matched to answers, per-type timeouts, and an idle close after 5 minutes. Chrome's disconnect messages map to `helperNotInstalled` or `helperDisconnected` with their fixes. `wxt build --mode e2e` swaps in a scriptable in-memory helper; production bundles don't contain it.
- Dashboard: setup (Resume, read through the helper, review with pre-filled fields highlighted, then countries, Work Authorization per country, preferences, salary per country in its currency, screening, Self-ID defaulting to decline; each step saves), Profile (every section editable, one save bar), Resumes (labelled, one default), Saved Answers (search, edit, delete, per-company overrides), Tracker (search, Status and company filters, Status, notes, Snapshot view, add by hand with the already-applied warning, CSV export, CSV import with column mapping), Settings (Provider and model, helper health with plan quota, backup and restore). `resumeUnreadable` asks for a readable copy instead of offering Retry.
- e2e: `test.use({ helper: 'inMemory' })` loads the test build (documented in CLAUDE.md). Specs cover setup, the Tracker, CSV round trips and backup, plus setup against the real helper's fake Provider and `fail:resumeUnreadable`.

**Core changes** (own commits)
- Guardrail gap closed: a Saved Answer from a form field (`source: 'draft'`) must carry `fieldType: OrdinaryFieldType`. Self-ID, Attestation and never-stored types fail to compile and fail to parse (storage reads, backups, runtime messages). The taxonomy's spec helpers keep sensitivity as a literal type, so `FieldTypeWith<S>` / `OrdinaryFieldType` / `ordinaryFieldTypeSchema` derive from `FIELD_TYPES`.
- Optional `model` (`modelIdSchema`: no leading `-`, no spaces or shell text) on mapFields, draftAnswer and parseResume requests.

**Decisions the docs didn't cover**
- The dashboard uses the data API directly (same origin as the background); the side panel and content scripts go through background messages. Runtime messages are JSON, so Resume bytes cross as base64.
- Accepting a Draft for a question you already have: on one employer's form it becomes that employer's override (dropped again if it equals the main answer); otherwise it replaces the answer. Questions are unique by `labelsMatch`.
- Applications added by hand or imported get a Posting key from known ATS URLs (board slug, job id), else `generic` / company slug / host and path. Rows without a company or an http(s) URL aren't imported (core's Posting requires a URL); the preview lists them by row. A missing applied date becomes today's, with a warning.
- CSV cells that start like a spreadsheet formula get a leading apostrophe on export, and exactly one is removed on import, so round trips are exact.
- Setup requires an answered Work Authorization (authorized, sponsorship) for each country you add. Core's address needs a street, so a Resume that gives only a city stops the review step there.
- Downloads are plain links you click, and file inputs are cleared by remounting them: `.click()` and assigning `.value` stay banned in the extension too.

**Left**
- The helper doesn't read the request's `model` yet: it takes models from its own `config.json`. Until it does, the Settings model field is saved and sent but has no effect. The helper fix is small (pass `request.model` to the Provider in `dispatch`).
- Manual and imported Posting keys duplicate a little of what fill's `postingKeyFromUrl` will do; switch `src/tracker/posting-key.ts` to it once it lands, so both always agree.
- The side-panel Fill flow (not built here) should use the messages above, and send `applications.findByPosting` when a Posting opens.
- No status history or reminders (design.md says none for v1).

**Gotchas**
- Chrome styles extension pages' `body` at 75% of `system-ui`, so text came out at 10.5px. `src/ui/styles.css` now resets `body` to `:root`'s font; this fixes the side panel too.
- eslint-plugin-react-hooks 7 includes the React Compiler rules (`refs`, `purity`, `set-state-in-effect`, …). Load data in effects with the `setState` inside the promise callback, and call `new Date()` / `crypto.randomUUID()` only in event handlers.
- fake-indexeddb 6.2.6 (dev dependency) backs the data layer's unit tests. Real Chrome storage is covered by e2e (Blob round trip in the backup spec).
- In e2e, wait for the list after a delete before clicking the next row: it reloads from the broadcast, and a stale count races it.

## 2026-10-28 · Helper uses the model picked in Settings (packages/helper)

**Landed**
- A task runs on `request.model`, else `models.<provider>` in config.json, else the default (Sonnet for Claude, the account's default for Codex). `src/providers/model.ts` (`resolveModel`) does the choosing for both Providers, inside `createCliProvider`; `dispatch` hands `request.model` to the Provider as a third argument (`HelperProvider` only: core's `Provider` is unchanged).
- Claude gets it as `--model`. Codex gets it in `thread/start`. `model/list` is now kept (`AppServer.models`); a name the catalog doesn't offer runs on the account's default instead (the d49a707 ChatGPT-login fix), and the helper log gets `provider.modelFallback` (no name in it).
- A model name becomes CLI input, so it is checked with core's `modelIdSchema` (starts with a letter or digit, no spaces or shell characters, 100 max) wherever it comes from. `dispatch` already refuses a bad `request.model` at the schema (`invalidRequest`, with a fix that points at Settings); `resolveModel` checks again and also covers config.json (`providerFailed`, with a fix that points at config.json). Nothing is spawned, and the name is never echoed.
- `.claude/worktrees/` is git-ignored.

**Decisions the docs didn't cover**
- A bad config.json model only fails requests that use it: a valid `request.model` never reads it. I left `helperConfigSchema` loose (`z.string()`), since a strict one would make the whole config "invalid" and every Provider report `providerNotFound`.
- Codex's fallback is silent to the user (it is the AI choosing a model, not a failure); only the log notes it. If the catalog can't be read there is no list to check, so the account default is null and Codex picks, as before.

**Left**
- A Claude model that `claude` itself rejects (a well-formed name that doesn't exist) comes back as the generic `providerFailed`. Telling the user which model was wrong needs the CLI's error text matched, like `NOT_LOGGED_IN` in `claude/output.ts`.
- `model/list` is read as one page. The real one returned 6 models and `nextCursor: null` on codex 0.158.0; follow the cursor if that changes.
- Nothing yet shows the user, in Settings, which models Codex offers.

**Gotchas**
- `STUB_*` knobs are unchanged: the Codex stub's catalog already offers `stub-big` and `stub-default` (default), which is what the new tests use.
