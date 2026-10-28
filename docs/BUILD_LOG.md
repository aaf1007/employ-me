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

## 2026-10-28 · Fill engine (packages/fill), fixtures and fill e2e

**Landed**
- `extract/`: every control under a form root, open shadow roots included, as `{fieldId, label, section, control, options, required, maxLength}` plus the widget act/ needs. Labels from `aria-labelledby`, `label[for]`, wrapping labels, `legend`, group labels, the field's container, then nearby text. Options from native selects, radio/checkbox groups, answer buttons (Ashby's Yes/No) and open listboxes; react-select menus render only while open, so act/ remembers what it saw for the next plan.
- `classify/`: adapter map → deterministic never-stored / Attestation / Self-ID checks (label, options, section) → taxonomy regexes (the visible label beats a wrong `autocomplete` token) → `autocomplete` → exact Saved Answer match. Self-ID types follow the Posting's country (a question naming a country wins); a topic the country keeps no answer for is `selfId.other`, which fills only a decline option.
- `answer/` + `plan/`: one step per field (write, review, skip with a fix, or await the Provider). Work Authorization, salary and Self-ID by country; unclear country → review with each country's answer side by side. Option matching (`match/`): exact, normalized, synonym patterns, token overlap, salary ranges, seasons for graduation dates; two equal hits are `ambiguousOption`.
- `act/`: React-safe setter, the combobox driver (full press, ArrowDown fallback, type to search, pick, read back, close), Lever's search-as-you-type box (new guarded op `typeaheadOption`), radios and checkboxes (click for React, events only on Lever), answer buttons, DataTransfer files, "Add another". Every write is read back after a 60 ms settle, so a value React snaps back is `valueDidNotStick`.
- `execute()`: Resume first and wait for the parse where the ATS parses it (Lever), one "Add another" per extra Profile entry (Greenhouse education/employment), then every write, then up to two rounds for questions that appear because of earlier answers. Idempotent: executing a re-plan doesn't re-upload or re-pick.
- Adapters: Greenhouse (ids, EEOC block, education, `#grnhse_iframe` embeds), Lever (`baseTemplate` JSON for cards and surveys, typeahead location, resume-parse wait), Ashby (`_systemfield_*`, autofill box ignored), generic (largest `<form>`).
- `detect-submission/`: `isConfirmation` and `watchForSubmission` (Greenhouse `/confirmation`, Lever `/thanks`, Ashby success container; "Did you apply?" after 15 s without one).
- `posting/`: `readPosting` (ATS markup, then JSON-LD), keys, canonical URLs, location → country, `publicApiRequest` (URL descriptor for the net module) and `parsePublicPosting` (incl. Greenhouse's option lists, passed back as `postingDetails`).
- Fixtures: 12 live public forms recorded 2026-10-28 as HAR (`tools/fixtures/record.ts`, scrubbed by `scrub.ts`): Greenhouse Anthropic (US, EEO, AI policy, arbitration), MongoDB (embedded, Dublin, GDPR), GetYourGuide (Berlin, GDPR retention), Geotab and Faire (Canada); Lever EQ Bank (Canadian equity survey), Palantir (US EEO, signature), Spotify (UK); Ashby Wealthsimple, OpenAI, ElevenLabs; generic Helsing. Nothing was submitted.
- e2e: `fill.spec.ts` (one per fixture: every outcome and DOM value, Attestations untouched, no submit event, no submission request), `fill-seam.spec.ts` (Provider mappings incl. low confidence, accepted Draft, polish mode, no Profile data in the mapFields body). Harness: `sites.replay(har)`, `sites.requests`.
- `pnpm fill-rate` and the README coverage table: Greenhouse 71%, Lever 77%, Ashby 67%, generic 57% of fields filled by rules alone; the rest are review or "couldn't fill" with a reason.

**The API integration calls** (all from `@employ-me/fill`):
- `plan(document, profileView, savedAnswers, { resume: { meta, file }, posting?, postingDetails?, provider? })` → `FillPlan` (read-only), then `await execute(plan)` → `FillReport { outcomes, awaitingProvider, fields, plan }`.
- Seam: send `plan.providerRequest` (`{ats, fields, savedQuestions}`, built by core's `toProviderField`) as `helper.mapFields`; build Drafts from `plan.draftRequests` (`question`, `mode` 'polish' when the form has an AI policy, `posting`, `employer`, `fieldType`) with core's `toDraftContext`. Then `plan()` again with `provider: { state: 'answered' | 'unavailable', unavailableFix, mappings: output.mappings, draftsReady, accepted: [{fieldId, text}] }` and `execute()` it. Mappings below `MIN_MAPPING_CONFIDENCE` (0.7) go to review as a suggestion, never written.
- `watchForSubmission(document, plan.ats, onSignal)`; `plan.posting.key` for `applications.findByPosting`.

**Core changes**: none.

**Lint/config changes**: `e2e/.build/` (the generated fill bundle) is ignored by ESLint and Prettier; the root tsconfig allows `.ts` import extensions so `tools/*.ts` run directly under Node; root devDependencies gain `@employ-me/fill` (e2e bundle) and `zod` 4.6.7 (HAR and expected-file schemas). CODING_STANDARDS "Adapters" now describes HAR fixtures (own commit).

**Decisions the docs didn't cover**
- e2e injects a test-only IIFE bundle of the engine into the replayed frame (main world); the content script wiring comes with the side panel.
- An optional free-text question with no Saved Answer is "Couldn't fill: notInProfile" with "click Draft"; a required one awaits a Draft. An accepted Draft fills with source `savedAnswer`.
- A company missing from "worked here before" is review (`askEachTime`), not "No". A language not in the Profile is "Couldn't fill", not "No".
- Lever's radios and checkboxes are set without clicks (its hCaptcha watches scripted clicks); React sites get the element's own click.

**Left**
- Side panel and content script wiring. The content script needs `profile.get`, `resumes.getFile` (base64 → `File`) and Saved Answers; the side panel needs `helper.mapFields`, `helper.draftAnswer`, `savedAnswers.saveAcceptedDraft` (with `DraftRequestRef.fieldType`), `applications.findByPosting` and `applications.recordSubmission` on a `confirmed` signal. The net module can use `publicApiRequest`/`parsePublicPosting`; `src/tracker/posting-key.ts` can switch to `postingKeyFromUrl`.
- Executing again overwrites a user's edits to fields the rules filled; re-execute only after a re-plan.
- Workday; closed shadow roots; date pickers other than MM/DD/YYYY; work-history sections on ATSs other than Greenhouse; a per-label cache of mappings.

**Gotchas**
- Greenhouse wraps react-select and keeps the menu state itself: it opens on mouseup (or a keyup), and commits a choice when the menu closes. A synthetic mousedown alone does nothing.
- intl-tel-input keeps a hidden `[role=listbox]` of 244 countries in the page; only visible listboxes count.
- Greenhouse swaps the file input for an upload widget that waits for XHR upload progress, which Playwright's `route.fulfill` never emits: e2e reads `<uploading>` there.
- Ashby autosaves every value as it's entered (`ApiSetFormValue`), Lever parses the Resume on attach, Helsing fetches an upload token: the specs answer these as side requests; any other write to the form's site fails the spec.
- Playwright's HAR replay refuses `_file` paths outside the HAR's folder, so bodies live in `fixtures/<ats>/har/` (shared by that ATS's fixtures). Re-recording prunes unused bodies.
- Node can't load core's extensionless imports, so `tools/fill-rate.ts` has its own small schema; the specs check the full one.

## 2026-10-28 · Guardrail hardening (core, fill, lint)

**Landed** (one commit each)
- Saved Answers can't hold a Self-ID, Attestation or never-stored question. `detectSensitive` moved from fill/classify to core (`taxonomy/sensitive.ts`, plus `sensitiveQuestion()`), so the Fill and Saved Answers use the same rules; it now also finds a typed "Password" question. `savedAnswerSchema` refuses those questions (`savedQuestionSchema`, `SENSITIVE_QUESTION_MESSAGE` shown at the question), which covers typing, editing, accepted Drafts, backups, runtime messages and storage reads. Second line: `toDraftContext` leaves them out, `toProviderSavedQuestion` refuses them (new `BoundaryRefusal` `sensitiveQuestion`), and both input schemas refuse them on parse, so the helper does too.
- A field the rules didn't recognise, mapped by the AI to `selfId.*`, `attestation.*` or `never.*`, is "Needs your review" (`providerMatched`, the mapped type, no suggestion) at any confidence. It is never written.
- act/'s guard splits `_`, `-`, apostrophes, camelCase, acronyms and digits into words, and matches word stems with any ending, in English and French (`Page suivante`, `Postulez`, `Valider`, `Se connecter`, `Créer un compte`, `S'inscrire`, …).
- `fireKey` refuses Enter anywhere (it throws: no act/ operation sends it). Inside a form it submits; Ashby's forms aren't a `<form>`.
- ESLint and Prettier ignore `.claude/`, so agent worktrees no longer break `pnpm check` in the main checkout.

**New lint rules** (`tools/eslint/boundaries.js`; every one has a firing case in `boundaries.test.ts`). Banned names now match on any object and by any spelling: `x.name`, `x['name']`, `` x[`name`] ``, `X.prototype.name.call(x)`, `const { name } = x`.
- Everywhere but tests, act/ included:
  - Submit: `submit`, `requestSubmit`, `SubmitEvent`, `createEvent`, `initEvent`, and `new AnyEvent('submit')`.
  - Injection: `createElement(NS)`, `insertAdjacentHTML`, `createContextualFragment`, `setHTMLUnsafe`, `parseHTMLUnsafe`, assigning `innerHTML`/`outerHTML`/`srcdoc`, `document.write/writeln/open`, `dangerouslySetInnerHTML`.
- Outside act/ (and tests), everywhere:
  - DOM writes: `click`, `dispatchEvent`, `set/remove/toggleAttribute*`, `insertAdjacentElement/Text`, `execCommand`, `setRangeText`, `showPicker`, `stepUp/Down`, `attachShadow`, `__defineSetter__`, `__lookupSetter__`.
  - Assigning `value`, `defaultValue`, `files`, `checked`, `defaultChecked`, `selected`, `defaultSelected`, `selectedIndex`, `indeterminate`, `textContent`, `innerText`, `outerText` or `nodeValue`, through any assignment target (`=`, `++`, destructuring, `for … of`).
  - `Object.assign` only onto an object literal (or `globalThis`); `Object.defineProperty/ies`, `Object.getOwnPropertyDescriptor(s)` and `Reflect` are banned.
- fill outside act/: no write through a computed key (`x[k] = v`; use `Object.fromEntries` or a `Map`), and no `focus`, `blur`, `select`, `append`, `prepend`, `appendChild`, `insertBefore`, `replace*`, `before`, `after`, `remove`, `removeChild`, `scrollIntoView`, `showModal`, `requestFullscreen`, `animate`, `style`, `classList`, `dataset`, `setProperty`.
- All of fill: no method call through a computed key (`x[name]()`).
- act/: `dispatchEvent` takes only `new X('literal-type', …)` built in place.
- Network, everywhere (tests too): `fetch`, `XMLHttpRequest`, `WebSocket`, `WebSocketStream`, `EventSource`, `WebTransport`, `RTCPeerConnection`, `importScripts`, `sendBeacon`, as globals and on any object. The net module may now only `fetch()`.
- Network in core, fill and the extension (not the helper): `import()`, `Image`, `Audio`, `Worker`, `SharedWorker`, global `open` and `window/globalThis/self/top/parent/frames/opener.open`, `location = …`, `location.assign/replace`, assigning `src`/`srcset`/`href`/`action`/`formAction`/`poster`/`ping`, and `setAttribute` with those names.
- core and fill: no `globalThis`, `window`, `self`, `top`, `parent`, `frames` or `opener`; no `.chrome`, `.browser` or `.open` on any object. `el.ownerDocument.defaultView` stays usable for reads (`getComputedStyle`, `MutationObserver`, `DOMParser`).
- `eval` is banned as a property too. `packages/*/src/test-support/**` counts as test code.

**Code the rules caught**: `fireKey` (event built in place), `greenhouse()` in `fill/src/posting/api.ts` (`Object.fromEntries`). CODING_STANDARDS "DOM" lists the new conventions (own commit).

**Interface changes for other packages**: core exports `detectSensitive`, `sensitiveQuestion`, `selfIdTopic`, `isSelfIdSection`, `SelfIdTopic`, `Sensitive`, `savedQuestionSchema` and `SENSITIVE_QUESTION_MESSAGE`; fill's classify still re-exports the old names. `BoundaryRefusal` has a new case.

**Left**
- A Saved Answer already stored with such a question now reads back as `corrupt`, and that fails the whole list and the backup export. Nothing released has written one; if one turns up, delete it from IndexedDB by hand or add a one-off cleanup.
- The question check uses the Fill's English rules (and a little French), so it can be wrong both ways: "What does diversity mean to you?" is refused (the Fill already treats it as Self-ID), and another language gets through.
- Lint can't see a name built at run time (`el['cl' + 'ick']()`) outside fill, where computed calls are still allowed. Extension content-script code isn't read-only like fill: `el.remove()` or `el.style.x =` there would pass. When the content script lands, give `*.content.ts` and its modules the fill read-only rules (`readOnlyDom`, `computedCalls`, `globalObject` in `scope()`).

**Gotchas**
- `no-restricted-properties` with only `property` also matches object patterns, parameters included (`({ submit }) => …`, renamed or not). Don't give your own objects a field with a banned name (`submit`, `click`, `remove`, `style`, and in core and fill `open`, `browser`).
- In fill, `const x: Record<string, T> = {}; x[k] = v` fails lint. Build it with `Object.fromEntries`.

## 2026-10-28 · Integration: Milestone 1 in the real extension (extension, fill, lint, e2e)

**Landed**
- **Opening the panel.** The toolbar icon opens the side panel (`setPanelBehavior`, now checked in `smoke.spec.ts`); it follows the window's active tab (`?tabId=` pins it in e2e). The content script (`src/content/`) answers `detect` from the frame holding the Application Form, so embedded Greenhouse boards work without frame ids. The panel shows the Posting, the already-applied warning (`applications.findByPosting`) and a Resume picker on the default Resume, and reads the Posting's public job API through the net module (now implemented: `fetchPublicPosting`, no cookies, referrer or redirects).
- **The Fill.** The content script runs `plan`/`execute` with `profile.get` and `resumes.getFile`, and answers a `FillView` (plain JSON: each field's descriptor, type, outcome, review details, Draft request; the `mapFields` input; the answers so far). The panel (`src/sidepanel/`: `PanelController`, `FillFlow`) sends `providerRequest` to `helper.mapFields` and drafts every required free-text question at once (`toDraftContext` from the panel's Profile), then sends `feedback` so the content script plans again (up to 3 rounds, for mappings that turn into Drafts). Fields list under Filled / Needs your review / Couldn't fill (reason and fix); matching outlines go on the page. The AI unavailable: the rules' Fill stands, the helper's fix shows, Retry asks again.
- **Drafts.** Editable, with unsupported claims flagged. Accept writes through a re-plan (`accepted`) and calls `savedAnswers.saveAcceptedDraft`. Optional questions and cover-letter text fields get a Draft button (fill's `draftRequestFor`). An AI-use policy switches to polish: you write, Polish sends `userDraft`, required questions wait for you (`draftReady`). "Use this" accepts a similar Saved Answer.
- **Re-planning** (fill, own commit). `execute(plan, previous)` writes only fields the re-plan resolved newly or differently (`writeKey`, a different Resume counts), never a field you changed on the page since the last execute (`userEdited`); when it has an answer for one anyway, the outcome is the new core reason `needsReview: keptYourEdit`. Fields that left the page keep their outcomes. Tests in `execute/replan.test.ts`.
- **Multi-step.** The content script watches for fields no plan has seen (`formChanged` on the session port) and the panel carries the same Fill on; a form whose steps are separate page loads is filled as each page of the same Posting loads, and answers carry across pages.
- **Submission.** The session port carries your answers (on edits, and at once on pointerdown and submit, before a Submit navigates away) and `watchForSubmission`'s signal. A confirmation (Greenhouse's history change, Lever's `/thanks` load, Ashby's success screen, the embed's `/embed/job_app/confirmation`) records the Application with its Snapshot: the public API's description, the answers (fill's `submittedAnswers`: never files, never-stored types or signatures; Self-ID included, it stays local) and the Resume. Leaving a filled form without one (another page, the tab closed, or a submit with no confirmation in 15 s) asks "Did you apply?".
- **Copy debug report**: labels, types, outcomes, reasons and fixes; no values, suggestions, Drafts or option text, query strings stripped, and any of your own words still found in it replaced with `[removed]`.
- **e2e** (`helper: 'fake'`): `milestone-1.spec.ts` runs the whole flow per ATS (Greenhouse geotab, Lever palantir in polish mode, Ashby wealthsimple, and the MongoDB embed), Tracker and Snapshot included, then the already-applied warning. `side-panel.spec.ts`: next step on a synthetic multi-step form (`fixtures/greenhouse/multi-step.html`) with your edit kept, "Did you apply?", the debug report, and a rate-limited Provider.

**Cross-package changes** (each its own commit)
- core: `keptYourEdit` review reason.
- fill: `execute(plan, previous)` and `FillReport.planned/values/writes/userEdited`; `read/` (`readFieldValue`, `fieldFingerprint`, `submittedAnswers`, `keptInSnapshot`); `act.outlineField`/`act.clearOutlines` (guard op `outline`) and `showOutcomes`/`clearOutcomes`; `draftRequestFor`/`draftFieldType`; `act/events` picks `PointerEvent` per press so fill imports outside a page (the extension's Node unit tests). No adapter or registry change.
- helper: the fake Provider's Drafts carry one unsupported claim, and polish returns your text marked `(polished)`.
- Convention (hard rule 5): CODING_STANDARDS said "no styles" on job sites' pages, design.md asks for outlines. Outlines are now the one exception, act-only (CODING_STANDARDS "DOM"). The content script has its own lint scope, `extension-content`, with fill's read-only rules plus no network and no global object (firing cases in `boundaries.test.ts`); it reads `location.ancestorOrigins` instead of `window.top`.
- e2e harness: `tabIdOf` finds a tab whose URL is hidden (a company site embedding a form) by its content script's frame.

**Decisions the docs didn't cover**
- The panel drives the helper (extension pages only may) and owns the ProviderFeedback; the content script keeps the plan and the last report for its document. One session port per Fill: when it closes (panel closed, page gone) the content script clears the outlines and forgets the Fill.
- A page load is `loading` then `complete`; history changes keep the document and aren't loads.
- The Posting stored with an Application has no description; it lives in the Snapshot (as the Tracker expects).
- Polish-mode required questions count as `draftReady` (the card waits for your text), not "Couldn't fill".

**Left**
- Unverified: Chrome's real side panel (Playwright opens sidepanel.html in a tab), following the active tab, real Claude and Codex Drafts, the tab-closed "Did you apply?" path and forms whose steps are separate pages (unit-tested only).
- The generic fallback isn't wired: the content script only runs on ATS hosts, so company sites show "no Application Form". It needs the optional host permission requested on a Fill click, then `scripting.executeScript` of the content script.
- Drafts are always requested in English (`language: 'en'` in fill's draft request); design.md wants the question's language.
- Each Fill (and each step) re-reads the Profile and the Resume file from the background; fine locally, could be cached per session.
- Commit 169a5e4's message predates main's lint hardening: its narrow style rule was dropped in the rebase for main's `READ_ONLY_DOM`, which already bans `style` in fill.

**Gotchas**
- Opening the side panel reads the Posting's public API, and Chrome logs a console error for a blocked request: any spec that opens the panel on a form must answer that API (`servePublicApi` in `e2e/panel.ts`), or `extension.errors` fails.
- Playwright can't grant clipboard permissions to an extension origin; the debug-report spec stubs `navigator.clipboard`.
- Seed e2e data by restoring a backup from Settings (`e2e/seed.ts`), not by writing IndexedDB.
- `browser.tabs.sendMessage` goes to every frame: content-script handlers must not answer (return false) unless their frame holds the form, or a frameless top page answers first.

## 2026-10-28 · Workday adapter (Milestone 2): synthetic forms, unverified until a live pass

**Landed**
- core: `workday` in `ATS_IDS`. `ATS_HOSTS` takes `*.example.com` hosts (`*.myworkdayjobs.com`, `*.myworkdaysite.com`) and an optional `publicApiPath`. Workday's CXS API shares the form hosts, so the allowlist is now by URL (`isPublicApiUrl`: host and path), and the match patterns and CSP carry `/wday/cxs/`. Tests in `core/src/ats.test.ts`.
- fill `adapters/workday/`:
  - `findForm` picks the visible `applyFlow*Page` step (My Information, My Experience, Primary/Secondary/Supplementary Questions, Voluntary Disclosures, Self Identify, Review) or the `signInContent` panel.
  - Field ids come from Workday's names in both schemes: current path ids (`name--legalName--firstName`, `workExperience-23--jobTitle`) and classic `data-automation-id`s (`legalNameSection_firstName`, `phone-device-type`). Entries are keyed by position, not Workday's global counter (`workExperience--startDate-month--0`).
  - An adapter map covers both schemes. Self-ID is left to the country rules, except CC-305, whose name and date are `attestation.signature`.
  - "Select One" buttons and prompts are comboboxes. The button's mirror input and the page footer are ignored. Work Experience and Education entries are added from zero ("Add", then "Add Another").
- fill `posting/workday.ts`:
  - Keys on (tenant, requisition). The first `_` ends the title slug, and `-1`/`-2` copy numbers are dropped (research §7).
  - `publicApiRequest` builds the CXS URL from the form's URL.
  - `parsePublicPosting` reads `jobPostingInfo`. The country comes from the locations, else the requisition's `alpha2Code`; the company is shown without its entity code.
  - `readPosting` reads the posting page's markup and its JSON-LD.
- fill `detect-submission`: Workday's "Congratulations!" / "Your application has successfully been submitted." panel confirms. The footer's Submit is a plain button and Workday fires no submit event, so a click on it starts the "Did you apply?" wait.
- Recorded (public, 2026-10-28): the NVIDIA (US) and RBC (Toronto) posting pages and their CXS answers, with the pre-login token and geo-IP country removed.
- Synthetic (hand-built, and named and marked as such):
  - `synthetic-us-apply.html`: current naming, all six steps.
  - `synthetic-ca-apply.html`: classic naming, Canadian questions and employment-equity Self-ID, with the Posting from the CXS answer.
  - `synthetic-sign-in.html`.
  - `synthetic-workday.js`, which stands in for Workday's widgets.
  - Markup sources: Workday's public `candidate-experience-jobs` and `candidate-experience-apply-flow` bundles (2026.43.25), and research §4.
- e2e `workday.spec.ts`:
  - Each flow, step by step. The test clicks Save and Continue and Submit itself, after checking the Fill pressed neither.
  - Self-ID Answers left at their default fill declines in Workday's own wording.
  - The sign-in page: email only, and no account.
  - The recorded Posting page and its API answer.
  - The real side panel carries one Fill across all six steps, to a recorded Application with its Snapshot.
- Fill rate: 72% (79 of 110 fields). The README marks it unverified.

**Shared fill changes** (outside the adapter; every other e2e expectation is unchanged)
- New adapter seams `AtsAdapter.typeToSearch` and `comboboxChoices` (off and empty by default), and `ComboboxRequest.searchIfNeeded` and `shown`. When a list shows nothing until searched, act/ types the answer. If that still lists nothing (Workday prompts that search only on Enter, which act/ never presses), the new `ActError` `searchShowedNothing` becomes "Couldn't fill" with that fix.
- plan: "Add another" also works from zero entries.
- Dates: one part per ARIA spinbutton (Workday's `dateSection*-input`). A month without a day reads "April 2025", or "04/2025" in date-picker boxes.
- answer: `work.location`, `work.current`, `work.startDate`, `work.endDate` and `work.description`; month dates in text boxes; "I have a preferred name" boxes.
- execute's report drops a field that appeared and left during the same execute with nothing written to it ("To", when "I currently work here" is ticked). Earlier steps' fields stay.
- extension: the panel names Workday, and the tracker keys hand-added Workday URLs with fill's `postingKeyFromUrl`.

**What only a live pass can confirm**
- Everything about the forms behind sign-in: nesting and label wiring, the prompt input's role (the fixtures give it `role="combobox"`, and without it act/'s guard refuses), how entry containers are numbered, question ids, option lists, whether the spinbuttons take a typed value, and the Congratulations panel's container.
- Which prompts search as you type (the school prompt has an `isSearchTypeAheadEnabled` switch) and which need Enter. In the fixtures, skills and field of study need Enter, so they are "Couldn't fill".

**Left**
- Enter-only prompts can't be searched, because `fireKey` refuses Enter by design. Either add a guarded "search this prompt" act/ operation, scoped to Workday's `searchBox` outside any `<form>`, or keep the "Couldn't fill".
- Hierarchical prompts ("How did you hear?" → Job Board → LinkedIn): a category isn't a leaf, so picking it doesn't stick.
- Websites and Languages panels aren't added.
- The guard reads a "Select One" button's text, its current value, as its name. A value containing a forbidden stem would refuse the field.
- "Autofill with Resume" (`applyFlowAutoFillPage`) parses the Resume on Workday's side. `parsesResume` is off, because Apply Manually doesn't parse.

**Gotchas**
- Workday's public bundles are the best source for its markup. The jobs bundle holds the sign-in components; `candidate-experience-apply-flow` holds the step pages, field paths and widgets.
- `extension/wxt.config.ts` built CSP origins with `pattern.replace('/*', '')`, which breaks on `https://*.…`. It now strips only the trailing `*`.
