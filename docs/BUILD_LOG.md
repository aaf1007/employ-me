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
