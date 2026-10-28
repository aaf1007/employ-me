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
