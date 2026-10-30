# Jobright's autofill: how it works, and what employ-me can take from it (2026-10-28)

This is a research snapshot from 2026-10-28. It builds on [the landscape research](2026-10-27-landscape.md) §1 (Jobright at a high level) and §6 (our field pipeline), and doesn't repeat them. Every source was read on 2026-10-28 unless a date says otherwise. Each claim is labelled:

- **Shipped code:** the extension itself, version 1.25.1, read from its CRX (§3). This is the strongest evidence here: it shows what the extension does, not what anyone says it does.
- **Jobright states:** Jobright's own pages, privacy notice, store listing, press release or staff replies.
- **Shipped manifest:** the extension's `manifest.json`. Primary evidence of what the extension may do, but not of how.
- **Reviewers report:** users and review sites. These are secondary and only directional. Several review sites sell competing products.
- **Inferred:** my reading of the above. Not confirmed by Jobright or by the code.

Anything marked **[unverified]** came from one secondary source, or couldn't be checked.

## TL;DR

1. **The shipped code answers most of what Jobright's public material doesn't.** Its pages are marketing ("1-click", "90% of major ATSs"), and there is no help center or engineering blog. So we read v1.25.1's own JavaScript, read-only (§3). Most "inferred" claims in the first version of this doc are now settled, and two of them were wrong.
2. **It is per-ATS code, not one generic engine.**
   - **Shipped code:** a small loader runs in every frame of every site. It injects the 8 MB engine only into frames it recognizes as one of about 75 ATSs or career sites. About 70 site-specific fillers share one base class.
   - Each site's selectors, label patterns, answer aliases and timings are JSON data, refreshed from Jobright's server every 15 minutes, with a per-site kill switch.
   - On a site it doesn't recognize it fills nothing. A model-based field finder for unknown forms exists, but nothing in v1.25.1 calls it.
3. **Jobright's server decides every answer.**
   - **Shipped code:** the extension sends each field's label, type, options and "required" flag, plus the page URL and job id, to `api.jobright.ai/swan/autofill/fill-v2` (or its streaming twin).
   - The server already holds your profile. It returns a value for each label, and the server also returns your profile data.
   - Local code only matches that text to an option (exact after normalizing, nothing looser for most widgets) and drives the widget.
   - School, degree, field of study and location go through a separate server loop. The server model either searches the ATS's own search API itself, or asks the extension to type a search term into the page and report the options it sees, over several rounds.
   - Nothing anywhere carries a per-field confidence. The panel shows each field as "filled" or "missing" only.
4. **It learns from your edits, on its server.** **Shipped code:** when you click Submit, it compares what it filled with what you are submitting, and uploads both sets of label/value pairs to `/swan/event/submit`. The filter applied before upload drops education and work-history sections, but not self-identification answers.
5. **It crosses several of our hard rules.** **Shipped code:**
   - It creates Workday accounts and signs in with a password you give it.
   - It ticks Lever checkboxes whose text mentions consent, terms, privacy, marketing or "certify" when the server gave no answer.
   - Its panel has a "Continue To The Next Page" / "Submit Application" button that clicks the site's own button for you.
   - For Meta's careers site, it sends that site's cookies to Jobright's server so the server can run the location search.
   - It strips `X-Frame-Options` and CSP from Lever and Ashby pages framed by jobright.ai.
6. **How well it works** (reviewers, unchanged):
   - The Chrome Web Store shows 4.9 from 398 ratings, and r/jobright is mostly praise.
   - **Recurring complaints:** custom questions answered wrongly, invented content from the Agent, the wrong Resume uploaded, school names not entered, and Workday and Greenhouse forms left half-filled.
   - The code fits these: answers come with no confidence, and coverage depends on a per-site list.
7. **What employ-me should take** (§7, ranked by accuracy gain):
   1. Read back that the Resume actually uploaded, and that it's the Resume you chose.
   2. Turn your own edits on the form into Saved Answers, locally and opt-in. Jobright does this server-side, at the Submit click.
   3. Searchable lists (schools, cities): try several search terms. Map field of study to Greenhouse's fixed list. Moved up from 5th.
   4. Wait for the page to go quiet, not a fixed 250 ms, before looking for conditional questions. New.
   5. Remember the Provider's field mappings locally.
   6. Check a Draft's claims against your Profile locally.
   7. For fields with no label, let the Provider choose among nearby page texts by id, never write a label. New, from Jobright's unused field finder.

   **What to avoid:** handling sign-in, ticking consent boxes, clicking the site's Next or Submit, sending a site's cookies or your answers to a server, downloading site rules from a server, and claiming coverage you can't show. Writing through React's own handlers and answering a file picker are adopted as techniques inside `act`, and watching the Submit request as a signal in `detect-submission` (§7.9).

---

## 1. What Jobright publishes about autofill

| Source | What it says about *how* | Seen |
|---|---|---|
| [jobright.ai/job-autofill](https://jobright.ai/job-autofill) | "Instantly fill job applications on thousands of ATS platforms with just 1-click." FAQ: it "currently supports 90% of major applicant tracking systems, including MyWorkdayJobs, Greenhouse, Lever, iCIMS, Ashby, Workable and more." How it works: the extension "will automatically detect supported ATS websites. When you're on one, it will begin preparing the form", and one click completes it. Steps end with "Submit your application, done!" | 2026-10-28 |
| [Blog: Supercharge Your Job Search with Jobright Autofill](https://jobright.ai/blog/supercharge-your-job-search-with-jobright-autofill/) (2025-08-22) | Same ATS list. Autofill "mimics standard typing and form filling, so it won't get flagged by job sites." Tailored Resumes can be autofilled. "Review, and tweak if needed, then submit." Nothing on custom questions, dropdowns, multi-step forms or saved answers. | 2026-10-28 |
| [Blog: 2025's Best Auto-Apply Tools](https://jobright.ai/blog/2025s-best-auto-apply-tools-for-tech-job-seekers/) (2025-08-09, Jobright's own) | The extension autofills "on LinkedIn, Workday, and Greenhouse". | 2026-10-28 |
| [jobright.ai/ai-agent](https://jobright.ai/ai-agent) | The Agent is "applying for you": "the application forms are filled, and every submission is tracked". FAQ: US-only; "daily free credits" per feature, with a paid unlimited tier. No mechanism described. | 2026-10-28 |
| [Agent launch press release](https://jobright.ai/blog/jobright-launches-first-ai-agent-to-put-job-search-on-autopilot/) (2025-06-24) | The Agent "finds, customizes, and submits applications on behalf of job seekers" and "learns from every application". No mechanism described. | 2026-10-28 |
| [The Register, 2025-06-24](https://www.theregister.com/2025/06/24/ai_may_take_jobs_but/) (interview with the founders) | Runs on AWS. Uses OpenAI, Anthropic and Google models, and "we fine-tune Llama-based models on resume-specific and job-matching tasks". The Agent applies only when the candidate is "qualified", and respects site bot blocks by sending the user to apply by hand. | 2026-10-28 |
| [Privacy notice](https://jobright.ai/legal/privacy) (last updated 2026-06-15) | §6: AI features are provided through third parties "including OpenAI, Anthropic, Google Cloud AI and Amazon Web Services (AWS) AI", which receive input, output and personal information. §17: Gmail access is used to find ATS verification-code emails and extract the one-time code for an application you started. The notice says nothing about the extension, or about form content. | 2026-10-28 |
| Chrome Web Store listing (via [chromeboard](https://chromeboard.com/extension/jobright-autofill-–-insta-odcnpipkhjegpefkfplmedhmkmmhmoko) and [extpose](https://extpose.com/ext/418463) mirrors; the store page itself redirect-looped for our fetcher) | "Instantly completes every field on thousands of ATS sites." Names no ATS, and makes no claim about AI answers. Privacy section: data not sold, not used for unrelated purposes, not used for credit. | 2026-10-28 |

**Not found:** a help center (`/help` and an Intercom guess both 404), changelog or "what's new" notes, an engineering blog, Product Hunt maker comments about autofill, a YouTube demo, or job posts describing the extension. Jobright's [GitHub org](https://github.com/jobright-ai) holds only job lists and a MongoShake fork. **Their public material is marketing and says next to nothing about how autofill works.**

## 2. What the shipped manifest shows

Source: the `manifest.json` inside the v1.25.1 CRX (§3), which matches chrome-stats' [manifest preview](https://chrome-stats.com/d/odcnpipkhjegpefkfplmedhmkmmhmoko/source). Version 1.25.1, updated 2026-10-27, 300,000 users, 4.92 from 398 ratings, 2.91 MB ([chrome-stats](https://chrome-stats.com/d/odcnpipkhjegpefkfplmedhmkmmhmoko)). [Extension Auditor](https://extensionauditor.com/scan/jobright-autofill-instant-job-applications-job-mat-odcnpipkhjegpefkfplmedhmkmmhmoko) lists 88 versions and found no malware in v1.11.0.

**Permissions:** `storage`, `scripting`, `declarativeNetRequest`, `tabs`, `cookies`, `webNavigation`, `activeTab`, `alarms`. Host access: `http://*/*`, `https://*/*`, `<all_urls>`. What the code uses some of them for (**shipped code**, `static/background/index.js`):
- `alarms`: the 15-minute site-rules refresh (§3.3).
- `cookies`: touching the jobright.ai session before each API call, watching its `SESSION_ID` cookie for sign-in changes, and reading Meta careers cookies for a server-side search (§3.9).
- `declarativeNetRequest`: session rules that remove `X-Frame-Options` and `Content-Security-Policy` from `jobs.lever.co`, `jobs.eu.lever.co` and `jobs.ashbyhq.com` when a jobright.ai page frames them.
- `scripting`: injecting the engine (§3.1) and the page-world scripts (§3.4).

**Permission history** (chrome-stats):
- `webNavigation` added in v1.17.0 (2026-07-17).
- `webRequest` added in v1.18.0 and removed in v1.19.0 (2026-07/08).
- `alarms` added in v1.24.0 (2026-10-08).

**Content scripts.** The first version of this doc guessed each script's purpose from its name. The right-hand column now says what the code does.

| Script | Runs on | Frames / timing | What it does (**shipped code**) |
|---|---|---|---|
| `contents.*.js` (94 KB) | `<all_urls>`, except Cloudflare, `google.com/recaptcha/enterprise`, LinkedIn's tracking hosts and a few ad hosts | all frames, `document_start` | A loader, not the engine. It checks the frame's URL, and the `src` of its iframes and scripts, against a site registry (`~core/supported-sites`, `rules.json`, `enterprise-rules.json`). On a match it asks the background to inject `helper-app.*.js` into that frame (`injectHelperAppBundle`). CAPTCHA frames are excluded. |
| `helper-app.*.js` (8 MB, web-accessible) | injected on demand | the matching frame | The whole engine and the in-page React panel (antd). Per-site fillers, widget drivers, answer handling, submit tracking. |
| `field-discovery.*.js` | `https://*/*` | top frame, `document_idle` | A model-assisted field finder for unknown forms (§3.2). It only answers a `jobright:discover-fields` message, and nothing in v1.25.1 sends one: it is dormant. |
| `ats-submission-resume.*.js` | `<all_urls>` | all frames | Not about Resumes. It *resumes* submission detection after the page navigates: it picks up a pending "begin" from the Submit click and confirms it on the next page (§3.7). |
| `applied-success-popup.*.js` | `<all_urls>` | all frames, `document_start` | The "did you apply?" popup. Reviewers say answering "no" loses the autofill credit (§5). |
| `clearcompany-submission-attribution.*.js` | `*.clearcompany.com/careers/jobs/*` | all frames | Submission detection for ClearCompany. |
| `*-submission-network-main.js` (Workday, Oracle, SuccessFactors, BrassRing, ClearCompany) | not in the manifest: registered at run time with `chrome.scripting.registerContentScripts` in the page's `MAIN` world | `document_start` | Wrap the page's `fetch` and `XMLHttpRequest` to see the ATS's final submit request (§3.7). |
| `workday-password-sync.*.js` | jobright.ai | top frame | Copies the Workday account password the extension keeps in `chrome.storage.local` into jobright.ai's IndexedDB, so the web app and Agent can use it. |
| `agent-submission-sync.*.js` | jobright.ai, `localhost` | top frame | Syncs the Agent's submissions into the Tracker. |

**Web-accessible resources:** `helper-app.*.js`, about 50 SVGs, flag and globe images, and a font. **Shipped code:** the engine is injected as a file into the page's isolated world, and its panel is a React app drawn into the job site's page, not a Chrome side panel.

**What the first version inferred, checked against the code:**
- **Wrong:** "one generic DOM engine runs everywhere, plus a few per-ATS scripts". The engine is per-site (§3.1), and an unknown site gets no Fill.
- **Right:** field understanding and answers come from Jobright's servers, and DOM writes happen locally in the page.
- **Partly right:** "Profile values and form content reach Jobright's servers". Form labels and options are sent. Your profile is already on the server, which sends values back. What you type on the form is uploaded at Submit (§3.6).
- **Answered:** mapping is server-side for every field, with no screenshots and no local keyword table for answers (§3.3).

## 3. What the shipped code shows (v1.25.1, read 2026-10-28)

**How it was read.**
- The CRX for id `odcnpipkhjegpefkfplmedhmkmmhmoko`, v1.25.1, was downloaded with your approval and unzipped into a scratch folder outside the repo. It was never installed, loaded or run. No request was made to any endpoint it names.
- The minified files were pretty-printed with Prettier into a separate folder and read with grep.
- Plasmo builds with Parcel, which keeps each module's source path as an alias (`~contents/crawler/utils/input`, `~api/autoFill`). Locations below give the file and that alias. `helper-app.js` is the 8 MB engine; `background` is `static/background/index.js`.
- Each subsection separates **code shows** from **inferred**.

### 3.1 Architecture: where the engine runs

**Code shows:**
- `contents.js` decides per frame whether to start (`~contents/shared/runtime-activation`, `getRuntimeActivationReason`). It matches hosts, URL patterns, and embedded iframe or script URLs. It doesn't start in embedded frames on confirmation-like paths (`/confirmation`, `/thank-you`, `/success`).
- `helper-app.js`, `~contents/crawler/target` (`getTargetName`): an ordered host table returns one of about 75 site names: `greenhouse`, `myworkday`, `lever`, `ashbyhq`, `icims`, `oraclecloud`, `successfactors`, `phenom`, `smartrecruiters`, `workable`, `taleo`, `eightfold` and many single-employer sites (Tesla, Apple, Google, Walmart, Uber). An unmatched host returns `null` and logs `no-site-target`.
- About 70 classes extend `BaseFiller` (`~contents/sites/base-filler`), one or more per site.
- **Per-site rules as data.** Greenhouse, Lever, Ashby and Workday ship JSON rule files (`~remote-rules/sites/*.json`). Each has `selectorTables` (XPath and CSS), `labelPatterns`, `answerMaps` and `params`. Workday's has 67 selector tables, 97 label patterns, 31 answer maps and 75 timing parameters.
- Every 15 minutes the background fetches `/swan/autofill/site-rules?schema=1&v=<version>` with an ETag, normalizes it, and keeps the last good copy (`~background/site-rules-refresh`, `~core/site-rules/normalize`). The normalizer accepts strings, string lists and numbers only: data, not code.
- A per-site kill switch (`~core/site-rules/killswitch`) can block a Fill (`autofill_killswitch_block`).

**Inferred:** Jobright's "thousands of ATS platforms" is about 75 hand-written site adapters, kept fixable by shipping selectors as server data. That fits one user's report that only 3.5% of "autofill-capable" jobs actually filled: coverage is a list of sites, not a general capability.

### 3.2 Field discovery and labels

**Code shows (in use: per-site extraction):**
- Each site's `rules` module walks the form with its own XPath tables and builds elements of the shape `{label, type, required, options, children, $input, $label}`.
- For example, Greenhouse's `~contents/sites/greenhouse/rules` finds react-select containers, synthesizes labels for split month/year date fields, and nests education rows under `children`.
- Radio and checkbox text comes from `aria-labelledby`, then `aria-label`, then `<label>`, then the parent and its siblings, skipping hidden nodes (`~contents/methods/checkbox-label`).
- Labels are normalized by stripping `*`, collapsing spaces and lower-casing (`~utils/fieldLabel`).

**Code shows (dormant: `field-discovery.js`):**
- It collects controls under a form root (`input`, `textarea`, `select`, ARIA `textbox`/`combobox`/`checkbox`/`radio`/`listbox`, `contenteditable`). It walks open shadow roots and skips hidden, `inert` and `aria-hidden` subtrees.
- It skips password, hidden and button inputs. It notes `iframe-not-inspected` and `closed-shadow-roots-not-inspectable` as limitations.
- Budgets: 200 controls, 2,000 text nodes, 500 options per control, 20,000 DOM nodes.
- Labels come by rule first: `aria-labelledby`, `aria-label`, `labels`, then the group's `legend` or `aria-label`, then sibling text up to three ancestors up. It stops at a container that holds a second control.
- Fields with no label, or of an unknown type, go to the model, and only those. Each one is sent with up to 20 nearby text snippets as numbered **candidates** and up to 30 option labels. Payload `version: 2`, at most 100 fields and 128 KB, through the background to `/swan/autofill/experiment/discover`.
- The model may only return candidate ids and a control type. The instructions say to use only the supplied ids and never produce answers, selectors or invented options.
- The client rejects the whole reply if any id wasn't offered, a group was split, or a type changed. It also re-snapshots the DOM and throws the reply away if the form changed while it waited (`stale-dom-recapture-required`).

**Inferred:** this is groundwork for unknown sites, not yet switched on. The id-only reply is a good pattern: the model can't invent label text, and labels stay page text rather than anything about you.

### 3.3 Mapping: field to value

**Code shows:**
- **One server call answers the form.** `~contents/methods/answer` (`getElementRules`) strips DOM references from each element and sends this to the background:
  - each element as `{label, type, required, options, children}`;
  - `url`, `jobId`, `resumeId`, `tailorId`, `source` (the site name), `parser: "internal"`, `fromAgent`, and a per-domain token from `/swan/autofill/token`.
- Searchable lists have their options removed before sending (`optionsMode: "searchable"`). Placeholder options such as "Select…" and "Please choose" are filtered by a list the server can replace (`~core/autofill-options`).
- The background posts it to `/swan/autofill/fill-v2`, or to `/swan/autofill/fill-v2-stream` (server-sent events: `answer`, `profile`, `done`) when `/swan/autofill/config` turns streaming on (`~api/autoFill`). A 402 means out of credits; a 403 is tracked as `autofill_risk_limit_triggered`.
- No profile value is sent from the browser.
- **The reply** carries `fill_data_list`, a list of `{name: <label>, value}` pairs, and `profile_data` (your profile as the server holds it).
- Values are matched back to fields by label: exact first, then normalized (NFC, punctuation and `*` removed, case folded), and refused when two labels tie or currency symbols differ (`helper-app.js`, `~contents/methods/answer`).
- Education and work history are filled locally from `profile_data`'s structured lists, by per-site code.
- **Searchable fields go through a second server loop** (`~api/autofill-operation`, `~api/autofill-client-search`). The client sends the field type (`school`, `major`, `degree`, `location`, `company`), a fixed question such as "What school did you attend?", and `original_answer`, the value from your profile. Then either:
  - **Server-side search:** for Greenhouse, Ashby, Workday and others, the client also sends a `search_request_schema` describing the ATS's own search endpoint, and the server calls it. Greenhouse's is `boards.greenhouse.io/v1/boards/{token}/education/{type}`; Workday's are `/schools`, `/values/educations/degrees` and `/values/educations/fieldsOfStudy` on the tenant. The server replies `SELECT_OPTIONS`.
  - **Client-side search** (iCIMS, Phenom, SmartRecruiters, Oracle and others): the server replies `REQUEST_SEARCH` with a term. The extension types it into the page, collects the options shown, and sends them back with a round id. This repeats until `SELECT_OPTIONS`, `RETURN_EMPTY` or a failure code.
- **Fallback option lists and aliases are data.** Greenhouse's rules ship `DEGREE_FALLBACK_OPTIONS` (10 degrees), `DISCIPLINE_FALLBACK_OPTIONS` (Greenhouse's fixed field-of-study list) and `RACE_FALLBACK_OPTIONS`. Workday's ship `COUNTRY_ALIAS_GROUPS`, `DISABILITY_ALIAS_KEYS` and `DEFAULT_SELECT_VALUES`.
- `answer-regeneration` lets you ask for a new answer to one question.

**Inferred:**
- All label understanding and answer choice happen on the server, with models the privacy notice names.
- There is no local keyword table that maps a label to a profile field: the "rules" in the code find widgets, not meanings.
- The `/swan/autofill/fill` path, which sends a `tree` and the page `html`, is reachable only through a background handler (`getAgentQLRule`) that nothing in v1.25.1 calls. It looks retired.

### 3.4 Writing values

**Code shows:**
- **Text** (`~contents/crawler/utils/input`, `fillDefaultInputField`):
  - Before writing a number or date value, it tries the value on a clone of the input and gives up if the clone won't keep it.
  - It writes through the prototype's native `value` setter, then fires `input`, `change`, `blur`, a keydown and keyup with keyCode 13 (Enter), `focus`, `click`, `change` and `blur`. It stops early if the field becomes disabled.
- **Checkboxes** (`~contents/crawler/utils/checkbox`): `click()`, or set `checked` and fire `change`, plus a `click` event on an enclosing `div[role=checkbox]`.
- **Options:** `findExactChoice` (`~contents/methods/choice-match`) needs one exact match after NFKC, curly-quote and case normalizing. A Levenshtein `fuzzyFindBest` (`~contents/crawler/utils/select`) defaults to similarity 1.0, which is exact, and refuses ties. Ashby's option search (`~contents/sites/ashby/operations`) uses Fuse.js at threshold 0.35.
- **React internals, in the page's own JavaScript world.** The background injects small scripts with `chrome.scripting.executeScript({world: "MAIN"})`:
  - `injectReactSelectFiber` walks from a DOM node to its React fiber (`__reactFiber$…`), finds the react-select instance and calls its `setValue` with the matching option. It is used by Greenhouse, whose rules call this "Plan B" (`PLANB_*` params).
  - `injectWorkdayFiber` calls Workday's React props directly (`onChange`, `onOptionSelection`, `onDatePicked`) for text, selects, dates and checkboxes.
  - Others: `injectRecruiteeFiber`, `injectWorkableCheckbox`, `injectAshbyFieldMetadata`.
  - The content script and page script talk through `CustomEvent`s such as `__jr_react_select_request`.
- **Files:** the Resume is fetched from Jobright as base64 and set through `DataTransfer` (`~contents/methods/answer`, `fetchPdfAsBlob`).
  - For sites whose upload button opens a file picker with no visible input, `interceptFileInputClick` temporarily replaces `HTMLInputElement.prototype.click` and `window.showOpenFilePicker` in the page world, so the site's next file prompt gets the Resume. It restores them after 10 seconds or one use.
  - Per-site waits follow (`RESUME_ATTACH_WAIT_TIMEOUT_MS` on Greenhouse; uploaded-file selectors on several sites).
- **Workday steps:**
  - It waits until the count of `[data-automation-id^="formField-"]` is the same on two polls before reading the step.
  - It searches prompts with retry limits (`SEARCH_MISMATCH_RETRY_LIMIT`, virtual-scroll every 4th retry) and checks checkbox state until stable.
  - It fetches Workday's own value lists (degrees, countries, phone codes).
  - It fills each new step automatically after you move to it (`~core/pagenation`, invocation `"pagination"`).
- **Conditional questions** ("combo questions", `BaseFiller.runComboQuestionAutofillIfNeeded`): after filling, it waits for the DOM to go quiet (a `MutationObserver` quiet period with a maximum wait), re-extracts, asks the server only about new fields, and fills them, for a set number of rounds.

**Inferred:** the event burst and the Enter key are tuned to make widgets commit, at some risk. Enter in a form control can submit the form, which is why our `act/events.ts` refuses to press it.

### 3.5 Verification and what you see

**Code shows:**
- Some read-back, per site. Ashby re-reads text up to 5 times at 100 ms intervals and also checks `validity.valid` (`~contents/sites/ashby/operations`). Greenhouse retries an empty input up to 5 times (`INPUT_RETRY_COUNT`). Native selects get up to N attempts (`NATIVE_SELECT_MAX_ATTEMPTS`).
- Option lists are polled until loaded (`OPTIONS_POLL_MAX_RETRY`, `COMBOBOX_POLL_MAX_TRY`).
- The panel's `ProgressTracker` (`~contents/shared/filler`) has two field states only: `filled` and `missing`. A field counts as filled when its handler returns success.
- There is no confidence field anywhere in the client or the stream protocol.
- Missing fields are listed, and clicking one focuses the field on the page.

**Inferred:** a wrong but accepted answer shows as "filled". Users meet that as "it gets the autofill questions wrong all the time" (§5).

### 3.6 Learning from your edits

**Code shows:**
- When it fills, `BaseFiller.bindSubmitButtonTracking` saves an "autofill snapshot", a map of label to value.
- It listens for your click on the site's Submit button. On the click it takes a "submit snapshot" of the same fields and builds a payload with both snapshots, the server's original answers (`falcon`), the form URL and the site (`~contents/sites/autofill-answer-pair-tracking`, `~utils/autofill-answer-pair`).
- The background sends it as event `autofill_answer_pair` to `/swan/event/submit`.
- The filter applied first (`createAutofillFieldReportingFilter`) removes education and work-history section labels, and the Resume field on SuccessFactors. Nothing in it removes EEO or other self-ID questions.
- A star-rating prompt after Submit also compares the two snapshots (`~utils/starRating`).

**Inferred:** this is the "learns from every application" of the press release. The learning happens on Jobright's server, from everything you submit. You can't see it or control it.

### 3.7 Submission detection

**Code shows:**
- **Click, then confirm.** A click on the site's Submit button starts an "attempt" in the background (`markAtsJobApplied`, action `begin`, held for 5 minutes). The attempt is then confirmed with evidence:
  - a success selector or URL from the site's rules (Greenhouse's "We got your application" heading; Workday's `candidateHomeTaskModal` dialog titled "Application Submitted", or the route `/jobTasks/completed/application`);
  - or network evidence.
- `ats-submission-resume.js` carries a pending attempt across the page load that follows Submit (actions `resume` and `confirm`).
- **Network evidence** (`myworkday-submission-network.js`, page world):
  - It wraps `fetch` and `XMLHttpRequest`, but only "arms" when a Submit click on Workday's footer button happened within the last second.
  - It then watches for Workday's finalize request, reads up to 64 KB of the response, and reports success only if the response says the submission succeeded.
  - Oracle, SuccessFactors, BrassRing and ClearCompany have their own versions.

**Inferred:** the network check is there because these ATSs' confirmation pages are unreliable to read. It costs patching the page's own `fetch`.

### 3.8 Other accuracy details

- **Label normalization:** NFC or NFKC, curly quotes straightened, `*` and punctuation removed, case folded (`~utils/fieldLabel`, `~contents/methods/choice-match`).
- **Phone country codes:** a module of country-name variants and per-site names (`~core/phone-country-code/*`).
- **Self-ID questions:** filled from the profile on the server. Several sites have handlers for veteran categories and disability forms. JazzHR's disability form date is set to today (`~contents/sites/jazzhr`).
- **Greenhouse race question:** found by keyword XPath, with a fallback option list.
- **Lever consent boxes** (`~contents/sites/lever`, `ensureAutocheckCheckboxAnswers`): a single checkbox whose label, option text, name or id contains a word from `AUTOCHECK_CHECKBOX_KEYWORDS` gets a "yes" answer when the server didn't give one. The words: agree, agreement, accept, authorize, certify, consent, marketing, privacy, terms, notice, "future job".

### 3.9 Where the code crosses our hard rules

| Our rule (CLAUDE.md) | What Jobright's code does |
|---|---|
| 1. The user submits; Attestations are left for the user | Ticks Lever consent, terms and "certify" boxes. Its panel button clicks the site's Next or Submit (`~components/NextPageButton`). In Agent mode it submits (`SubmitAgentApplication`). Presses Enter in text fields. |
| 2. Self-ID stays on the machine | Self-ID answers live on Jobright's server and are filled from there. Submitted answers, Self-ID included, are uploaded at Submit (§3.6). |
| 3. Network allowlist | Every Fill calls `api.jobright.ai`. Site rules are fetched every 15 minutes. For Meta careers, the site's own cookies and headers go into a `search_request_schema` sent to Jobright's server (background, `resolveCapturedMetaCareersLocation`). |
| 7. No passwords, no account creation | Workday "Create Account" and sign-in flows (`~contents/pre-autofill-flow/account-flow`, Workday rules' `ACCOUNT_*` selectors). A password-strength check for the Workday password you set. `workday-password-sync`. |
| LinkedIn and Indeed never supported | The job-page scraping rules (`~remote-rules/scraping-rules.json`) include LinkedIn and Indeed for importing postings. A LinkedIn banner component exists. |

## 4. The questions asked, answered as far as the evidence goes

| Question | Answer | Basis |
|---|---|---|
| Which ATSs, and how | About 75 named sites, each with its own filler (§3.1). Named publicly: Workday, Greenhouse, Lever, iCIMS, Ashby, Workable. An unknown site gets no Fill. | Shipped code; Jobright states |
| Custom questions | The server answers them from your profile and the label. No answer bank you control is visible in the client. A per-question "regenerate" exists. Users ask for "predetermined answers" ([Reddit, 2026-03-21](https://www.reddit.com/r/jobright/comments/1rz1jht/high_quality/oblsk2w/)). | Shipped code; reviewers report |
| Dropdowns and comboboxes | Exact match of the server's text to the options, with site drivers for react-select (including React internals) and Workday prompts. Schools, degrees, fields of study and locations go through a server search loop (§3.3). A user says it "sometimes failed to be able to enter in my school names" ([2026-09-02](https://www.reddit.com/r/jobright/comments/1w4gdd3/i_used_it_for_the_first_time_and_it_was_wonderful/p7cycgy/)). | Shipped code; reviewers report |
| Multi-step forms (Workday) | Each step is filled when you move to it, after the field count settles. The panel can also click Next for you. Users disagree on how well it works ([2026-04-23](https://www.reddit.com/r/jobright/comments/1stxzgb/i_like_how_they_autofill_workday_application/), [2026-05-07](https://www.reddit.com/r/jobright/comments/1t64d1n/got_laid_off_in_january_finally_have_an_offer/)). | Shipped code; reviewers report |
| Workday sign-in | Creates accounts and signs in with a password you set; syncs it with jobright.ai. Gmail verification-code extraction per the privacy notice. | Shipped code; Jobright states (privacy §17) |
| File uploads | `DataTransfer`, or a patched file picker in the page world. The Resume is fetched from Jobright (original, tailored or base). Bugs reported: the default Resume uploaded instead of the tailored one ([2026-09-16](https://www.reddit.com/r/jobright/comments/1wi3dhu/generating_custom_resume_apply_now_still_uploads/)). | Shipped code; reviewers report |
| Profile per Resume | Staff: "Currently, only Education, Work Experience, and Skills are updated when you switch resumes" ([2026-10-08](https://www.reddit.com/r/jobright/comments/1ww22c4/autofill_extension_uses_info_from_old_resume_on/pejow7l/)). The code sends a `resumeId` and `tailorId` with each Fill, and the server returns the profile data to use. | Jobright states (staff); shipped code |
| Iframes | The loader runs in all frames and injects the engine into a matching frame. Frames talk to the top page with `postMessage`. | Shipped code |
| Learning from corrections | Yes, server-side: what it filled and what you submit are both uploaded at Submit (§3.6). | Shipped code |
| Client- or server-side | Mapping and answers on the server; widget driving in the page (§3.3, §3.4). | Shipped code |
| Confidence or review display | None. Fields are "filled" or "missing" (§3.5). | Shipped code |
| When unsure | The server's answer is filled if it matches an option. There is no "needs review" state. | Shipped code |
| CAPTCHAs and bot checks | Excludes reCAPTCHA Enterprise frames. Has a Cloudflare challenge check (`~core/cloudflare-challenge`). The Agent defers to site bot blocks (The Register). | Shipped code; Jobright states |

## 5. How well it works (secondary, directional)

- **Ratings:**
  - Chrome Web Store 4.92 from 398 ratings ([chrome-stats](https://chrome-stats.com/d/odcnpipkhjegpefkfplmedhmkmmhmoko)).
  - Trustpilot 4.8 from 3,683 reviews ([Trustpilot](https://www.trustpilot.com/review/jobright.ai)).
  - r/jobright is mostly praise, and Jobright staff reply there. Treat it as a partly managed channel.
- **Wrong answers to questions:** "it gets the autofill questions wrong all the time" ([r/jobsearchhacks, 2026-03-10](https://www.reddit.com/r/jobsearchhacks/comments/1rpuzhg/is_there_a_better_version_of_the_jobright_ai/)).
- **Invented content (the Agent, not the extension):** the Agent answered a custom question with a team-lead role and a conference recognition. The user wrote: "Nowhere in my profile I mentioned anything about leading a team or attending a national conference!" The same post says the Agent "auto fills only 'greenhouse' applications" ([r/recruitinghell, 2025-12-05](https://www.reddit.com/r/recruitinghell/comments/1pex53h/jobright_agent_sucks/)).
- **Coverage claims vs. reality:**
  - One user says only about 3.5% of jobs marked autofill-capable actually filled. Jobright's reply promises to expand site support ([Trustpilot, 2026-10-01](https://www.trustpilot.com/reviews/6abe94908cc53467893d8e85)). The per-site design in §3.1 fits this.
  - Another user still filled "half the workday and greenhouse forms" by hand (above).
  - Competitor reviewers relay several one-star Trustpilot reports of autofill not completing ([careery](https://careery.pro/blog/ai-job-search/jobright-ai-review/), [6figr](https://6figr.com/blog/jobgpt-vs-jobright-ai-which-ai-job-application-tool-actually-works-in-2026-2-593)). Both sell competing products.
- **Resume handling:** the wrong Resume uploaded; switching Resume changes only some sections; old uploads stay on the portal (§4).
- **Requirements that aren't in the posting:** "it then shows something not in the job description like a requirement for location" ([r/jobright, 2026-06-25](https://www.reddit.com/r/jobright/comments/1uel7na/honest_review/)).
- **Credits and the popup:** the same post says closing a form brings up "applied?", and answering "no" forfeits the autofill credit. The free tier is reported at 4 autofill credits a day **[unverified]**: competitor reviews, relayed by [jobsaicopilot](https://jobsaicopilot.com/jobright-review/). The code confirms credits are checked server-side (HTTP 402, `/swan/credit/balance-v2`), not the numbers.
- **Browser support:** reported failing in Brave ([2026-06-15](https://www.reddit.com/r/jobright/comments/1u681ul/anyone_using_this_successfully_with_brave_browser/)) and DuckDuckGo (above).
- **No controlled test exists.** No independent source measured field-by-field accuracy per ATS.

## 6. What employ-me already does that this validates

These need no change, and the code backs them:
- **Per-ATS adapters with fixtures.** Jobright, with far more resources, also landed on per-site code. Our adapters plus the generic fallback (`packages/fill/src/adapters/`) are the same shape, with tests.
- **Conditional questions get another pass.** Jobright re-extracts after filling and asks only about new fields; so does `execute/index.ts` (`CONDITIONAL_ROUNDS`, `replan`).
- **Later steps fill as you reach them.** Jobright's pagination observer, like our Fill, carries on through each later step after you move to it.
- **Read-back after writing.** Every act/ write is read back. Jobright reads back only on some sites (§3.5).
- **Exact-first option matching that refuses ties.** Jobright's local matching is stricter than ours (exact only); ours adds synonym patterns and token overlap and still sends ties to review (`match/index.ts`).
- **Every field gets an outcome** (hard rule 6), including needs review. Jobright has only filled or missing.
- **The public fill-rate table**, including "Silently wrong" (README "Coverage").
- **Never pressing Enter** (`act/events.ts`). Jobright's text writer sends Enter on every field.

Jobright's gap between "90% of ATSs" and a user's 3.5% is the failure this design exists to avoid.

Narrow permissions, a side panel instead of UI injected into pages, and nothing running until you click (`packages/extension/wxt.config.ts`, design.md "Starting a Fill") are the opposite of Jobright's choices. Nothing in the code suggests those choices cost accuracy. Jobright's accuracy work is in per-site widget handling and server-side answers, not in its broad permissions.

## 7. What employ-me can take from this

Ranked by expected gain in accuracy. Each item gives the evidence, where it lands in our code, and how it fits the hard rules. None copies Jobright's code; each describes a technique.

### 7.1 Read back that the Resume uploaded, and that it's the one you chose
- **Evidence:**
  - Jobright's most concrete, repeated bug reports are about Resumes: the wrong file, the old file kept, and a Profile half-switched (§4, §5).
  - **Shipped code:** even Jobright waits for a settled upload state per site (Greenhouse's `RESUME_ATTACH_WAIT_*` params, uploaded-file selectors, Lever's has-file class) rather than trusting the input. It still checks state, not which file, so a wrong Resume would pass.
  - Our own live test found the same gap: "'Filled' for a Resume means it was attached, not that it uploaded". Greenhouse's widget stayed at "uploading" while the panel said Filled ([live test](../live-test/2026-10-28.md) "Left").
- **Change:**
  - `act.attachFile` (`packages/fill/src/act/index.ts`) checks only `input.files[0].name`.
  - Add a read-only adapter hook, e.g. `attachedFile(input): string | 'uploading' | null`, to `AtsAdapter` (`packages/fill/src/adapters/types.ts`). Implement it per adapter: Greenhouse's file-name chip, Ashby's uploaded state, Lever's parse banner (already watched by `waitForResumeParse`), and Workday's file row.
  - In `execute/write.ts` (the `'file'` case) and `execute/outcome.ts`, mark the field **filled** only when the ATS shows the chosen Resume's file name. "Still uploading" or a different name is **needs review**: "Check that <Resume label> finished uploading".
  - Show the Resume's label on the outcome, so a non-default choice is visible.
  - e2e: `e2e/side-requests.ts` already answers the S3 upload, so fixtures can assert the settled state.
- **Fit:** reads the page only. Act stays the only writer, and no network is added.

### 7.2 Your own edits become Saved Answers (opt-in, local)
- **Evidence:**
  - Jobright users want "predetermined answers" so that autofill is "more predictable", and get wrong custom answers "all the time" (§4, §5).
  - **Shipped code:** Jobright's learning loop is exactly this comparison: what it filled against what you submit, taken at your Submit click (§3.6). It runs on its server, without asking, and with Self-ID answers included.
- **What we have:**
  - Saved Answers come only from accepted Drafts (`savedAnswers.saveAcceptedDraft`, `packages/extension/src/sidepanel/fill-flow.ts`) or are typed in.
  - The Fill already knows which fields you changed: `FillReport.userEdited` (`packages/fill/src/execute/index.ts`).
  - `submittedAnswers()` (`packages/fill/src/read/index.ts`) reads what was sent. `extension/src/content/page-watch.ts` already sends the answers on your own Next or Submit press, before the page can navigate away. That is the same moment Jobright takes its submit snapshot.
- **Change:**
  - When an Application is created (confirmation screen or "did you apply?"), offer: "Save N answers you typed or changed for next time?" List the label and value of each ordinary field that was needs review, couldn't fill, or `userEdited`.
  - Accepted ones go through the existing `savedAnswerSchema`, whose `savedQuestionSchema` already refuses Self-ID, Attestation and never-stored questions (`packages/core/src/profile/saved-answer.ts`). Add a `source: 'form'` variant beside `'draft'`, `'manual'` and `'import'` in core, in its own commit. Like `'draft'`, it carries the field's `OrdinaryFieldType`.
  - Choice questions ("How did you hear about us?") are stored as the option text. `savedText` → `acceptedAnswer` in `packages/fill/src/answer/index.ts` then matches it through `match/`.
  - Code: core (schema), extension tracker and side panel (the offer), background router (`savedAnswers.*` message).
- **Fit:** local only, nothing uploaded. Sensitive questions are refused by the same rules the Fill classifies with, which is the filter Jobright's upload lacks. You choose each one.

### 7.3 Searchable lists: several search terms, and a fixed list for Greenhouse's field of study (moved up from 5th)
- **Evidence:**
  - Jobright "sometimes failed to … enter in my school names" (staff thread, §4). School and city pickers are remote, search-as-you-type lists on Greenhouse and Workday (landscape §4).
  - **Shipped code:** this is where Jobright spends the most machinery. A server model searches the ATS's own school, degree and field-of-study endpoints, or drives several rounds of typed searches in the page (§3.3). Workday's rules carry retry limits for mismatched searches.
  - Greenhouse's degree and field-of-study lists are fixed: Jobright ships both as fallback option lists. Only schools are open-ended.
- **What we have:**
  - `edu.school` searches once with the school name (`packages/fill/src/answer/background.ts`, `firstWins`), and `act/combobox.ts` / `act/typeahead.ts` give up with `optionNotFound`.
  - `edu.degree` already maps through the `degreeLevel` vocab (`answer/vocab.ts`).
  - `edu.discipline` is a plain `textTarget`, so "Software Engineering" finds no option on a list that only has "Computer Science" and "Engineering".
- **Change:**
  - Let `OptionTarget` (`packages/fill/src/match/index.ts`) carry `searches: string[]`: the full name, then without a leading "The" or a campus suffix, then a short name if the Profile has one (an optional `shortName` on an education entry, in core). act tries each in turn.
  - When none matches, the outcome is needs review, listing the top suggestions the site showed. `firstWins` still requires every word of the name (`match()`'s token rule), so it can't pick a different school.
  - Add a `discipline` vocab in `answer/vocab.ts`, like `degreeLevel`: synonym patterns from common majors to Greenhouse's fixed field-of-study names. Use it in `edu.discipline` when the field is a choice. Keep the exact text first, so a form whose list has your exact major still gets it.
- **Fit:** act stays the only writer. Typing into a search box is already allowed by the guard. Jobright's server-side search is out: it sends your school name to a server, and our Provider sees labels and options only (hard rule 2). Everything here runs locally.

### 7.4 Wait for the page to go quiet before looking for conditional questions (new)
- **Evidence:**
  - **Shipped code:** Jobright waits for a `MutationObserver` quiet period, with a maximum wait, before looking for conditional questions (`waitForComboQuestionsToSettle`). On Workday it waits until the field count is the same on two polls before reading a step (§3.4).
  - Our `settle()` in `packages/fill/src/execute/index.ts` is a fixed 250 ms. A slow ATS (Workday, a remote option list) can render a follow-up question after that, and the Fill then reports without it. The question gets filled only when `page-watch.ts` notices it later, if the panel is still open.
  - CLAUDE.md already says e2e waits for state, not for time; the Fill itself should too.
- **Change:**
  - Replace `settle()` with "no DOM mutations in the form for ~150 ms, at most ~1.5 s", using the page's own `MutationObserver` as `page-watch.ts` does.
  - In the Workday adapter, add a read-only "step ready" check (field count stable across two polls) used before the first plan of a step.
  - Unit tests with jsdom mutations; e2e under load per CLAUDE.md.
- **Fit:** read-only waiting, no network, no new writes.

### 7.5 Remember the Provider's mappings locally
- **Evidence:**
  - Wrong and unpredictable AI answers are Jobright's top complaint.
  - **Shipped code:** Jobright keeps no mapping cache in the client: every Fill asks the server again (§3.3), and nothing on screen shows how sure it is.
  - Landscape §6 step 4 already recommends caching mappings by `(ats, normalized label)`, but nothing in the repo does it: no mapping store in `packages/extension/src/storage/`, and `fill-flow.ts` calls `helper.mapFields` on every Fill.
- **Change:**
  - Add a store keyed by `(AtsId, normalizeLabel(label), hash of normalized options)` holding the `FieldMatch` and its confidence.
  - Before `mapFields`, satisfy known fields from the store and send only the rest. `ProviderInputs.mappings` (`packages/fill/src/answer/index.ts`) already takes a map, so the fill engine doesn't change.
  - Store a mapping only after a Fill whose field you didn't edit. Drop it when you edit that field (`userEdited`), so a wrong mapping isn't repeated.
  - A Settings control clears the store.
- **Fit:**
  - It holds labels and option lists only, the same data the Provider already sees (hard rule 2). Mappings that lead to Self-ID or Attestation are never stored; that's the same rule as in `fromMapping`.
  - Fewer Provider calls, so less of the user's plan is used.
  - Same question, same answer, every time.

### 7.6 Check a Draft's claims locally rather than trusting the model's labels
- **Evidence:**
  - Invented experience is the dealbreaker (landscape §8). Jobright's Agent invented a leadership role and a conference recognition (§5).
  - Our Drafts flag a claim only when the model itself labels it `unsupported` (`packages/helper/src/prompts/draft-answer.ts`, `CLAIM_SUPPORT` in `packages/core/src/provider/boundary.ts`, `flagged` in `packages/extension/src/sidepanel/drafts.ts`). A model that invents a claim can also label it `profile`.
- **Change:**
  - In the helper, after the Provider answers, check each claim against the source it cites, using the context the helper already receives (built by core's `toDraftContext` in `packages/extension/src/sidepanel/drafts.ts`). Numbers, years, employer and school names, titles and capitalized terms in the claim must appear in the cited source. If they don't, relabel the claim `unsupported`.
  - Also flag text the model didn't list as a claim but that contains such terms.
  - This is deterministic and testable with the stub Providers.
- **Fit:** local and deterministic. No new data goes to the Provider.

### 7.7 Fields with no label: let the Provider pick from nearby page text by id (new)
- **Evidence:** **Shipped code:** Jobright's dormant field finder (§3.2) sends a field with no rule-found label together with numbered snippets of nearby page text. The model may only answer with snippet ids. A reply citing an id it wasn't offered is rejected, and the reply is dropped if the form changed meanwhile. The model can't invent a label, and nothing about the user is involved.
- **What we have:** `extract/label.ts` tries `label[for]`, `aria-labelledby`, a wrapping `<label>`, `<legend>`, `aria-label` and the container's question text. When all of those fail, the field has no usable label. Neither the rules nor the Provider can classify it, so it ends "couldn't fill". This matters most for the generic adapter (`adapters/generic/`).
- **Change:**
  - In `extract/`, when no label is usable, collect up to ~10 visible text snippets near the control (siblings and up to three ancestors, stopping at a container with another control). Skip input values, so only page text is collected. Give each snippet a field-local id.
  - In core, let `toProviderField` carry these as `labelCandidates: {id, text}[]` (page text, length-capped), in its own commit with tests. `mapFields` output gains an optional `labelCandidateId`. The helper prompt (`packages/helper/src/prompts/`) says to choose an id or none.
  - The fill engine accepts the choice only if the id was offered and the snippet is still on the page. Then it uses that text as the label and re-classifies with the rules. A field labelled this way is **needs review** at most, never filled silently.
- **Fit:** the snippets are the form's own text, like labels and options today, so hard rule 2 holds. No Profile values are sent. Act is unchanged.

### 7.8 Lower-ranked
- **Treat a value the form flags as invalid as "needs review".** **Shipped code:** Jobright's Ashby text writer re-reads and also checks `validity.valid`. Our `act/read-back.ts` checks the value only. After a text write, a `validity` failure that wasn't there before the write (`typeMismatch`, `patternMismatch`, `tooLong`) could become needs review: "The form didn't accept this format". This catches phone and URL formats the site rejects but keeps on screen.
- **Two more confirmation signals.** **Shipped code** gives Greenhouse's newer confirmation heading ("We got your application", class `rich-text__title`), and Workday's `candidateHomeTaskModal` dialog titled "Application Submitted" with the route `/jobTasks/completed/application`. Add the Greenhouse text and the Workday route to `CONFIRMATIONS` in `packages/fill/src/detect-submission/index.ts`. The Workday entry is still marked "unverified until a live pass"; this is a second source, not a live check.
- **Coverage order.**
  - Jobright names Workable alongside iCIMS, and has fillers for both. Workable isn't in design.md's job-site table.
  - Users report Jobright weakest on Workday. Our Workday row is synthetic and unverified (README).
  - A live Workday pass comes before any new adapter.
  - Whether Workable joins "Later" is a design decision for you, not a change made here.
- **Resume vs. Profile mismatch.** Jobright's half-switch shows the risk: our Profile is parsed from one Resume, but you can attach another to an Application. When the chosen Resume isn't the one the Profile came from, the side panel could say so once, before the Fill.
- **Prepare before the click, locally.** The FAQ says Jobright starts preparing when it detects a form, though the code shows it asks the server only once a Fill starts. The side panel already starts its loads before the Fill button shows (BUILD_LOG 2026-10-28). Running `plan()` locally at that point (rules only, no Provider) would make Fill feel instant. Calling the Provider before you click would spend your plan unasked, so don't.

### 7.9 Techniques from Jobright's code to adopt (decided 2026-10-28)
The first draft listed these as "not recommended". The decision is to adopt them as techniques, rebuilt in our own code. Jobright's code carries no licence, so none of it is copied. Each one stays within the hard rules, and the two that write to the page (React handlers, file picker) stay inside `act`, as follows.
- **Write through the component's own React handlers when events don't stick** (§3.4: `injectReactSelectFiber`, `injectWorkdayFiber`).
  - Fallback only: use it when an event-driven write ends in `valueDidNotStick` on react-select (Greenhouse) or Workday.
  - It stays part of `act`. `act` runs `checkTarget` on the element first, then asks a page-world script to call that component's own `onChange` / `setValue` / `onOptionSelection` with the chosen option, then reads back as usual.
  - The page-world script ships in the extension package as a `world: "MAIN"` content script on the ATS matches (no remote code). It accepts only field-value operations and has no click, so it can't press Submit.
  - Changes `packages/fill/src/act/` (a new page-world entry and a fallback in `combobox.ts`, `typeahead.ts` and `setText`), `packages/extension/src/entrypoints/`, and the boundary rule in `tools/eslint/boundaries.js` plus its test. Hard rule 5: change the rule in its own reviewed commit and note it in BUILD_LOG.
  - Risk: the page can see these calls, and a React or Workday upgrade can break them. Read-back still decides the outcome, so a broken fallback is `couldn't fill`, never a false `filled`.
- **Watch the Submit request to confirm an Application** (§3.7, the `*-submission-network-main` scripts).
  - A page-world listener on `fetch` / XHR, armed only for about a second after the user's own Submit click. It records the request's URL and status only, never bodies.
  - Adds a signal to `packages/fill/src/detect-submission/`, ahead of the "Did you apply?" fallback. Most useful on Workday, where no confirmation page is verified yet.
- **Answer a file picker with no file input** (§3.4, `interceptFileInputClick`).
  - A fallback in `act.attachFile` for sites whose upload button opens a picker with no visible input. The page's `click` / `showOpenFilePicker` is patched for one use or 10 seconds, then restored.
  - None of our four ATSs needs it today, so it waits for an adapter that does.
- **Keep each site's rules as data** (§3.1, site rules).
  - Move each adapter's selectors, label patterns, answer aliases and timings into a typed data file next to it (`packages/fill/src/adapters/<ats>/rules.ts`, checked by a zod schema in core), so a site fix is a data change with a fixture.
  - Shipped in the package, never fetched. Jobright's 15-minute download from its server is the one part left out: we have no server, and hard rule 3 forbids remote config.

### What to avoid (Jobright's failure modes and choices)
- **Guessing instead of flagging.** Wrong custom answers with no warning, invented achievements, and a panel with only "filled" and "missing". Keep "needs review" and the claim flags. Never let a low-confidence mapping fill (`MIN_MAPPING_CONFIDENCE`).
- **Claiming coverage you can't show.** "90% of ATSs" against a user's 3.5%, from about 75 site adapters. Keep the measured fill-rate table, and never call a site supported without fixtures.
- **Handling sign-in.** Workday account creation, password sync, and Gmail code extraction are excluded by hard rule 7, and they add credential risk.
- **Ticking consent boxes or pressing the site's buttons.** Jobright's Lever auto-tick and its Next/Submit button are what hard rule 1 forbids.
- **Sending what you typed, or a site's cookies, to a server.** Hard rules 2 and 3.
- **UI injected into job sites, plus `<all_urls>`, `cookies`, `tabs` and `document_start` scripts everywhere, and stripping a site's framing protections.** These are trust and review costs (landscape §5). The code shows Jobright's accuracy comes from per-site work, not from these.
- **Metering Fills, and a popup that penalizes an honest "no".** Our "did you apply?" must stay free of consequences.
- **The auto-apply Agent and LinkedIn.** Jobright's 2025 blog says the extension works on LinkedIn, and its scraping rules include LinkedIn and Indeed. Ours never will.

## 8. Gaps

- **What the server does is not visible.** The client shows what goes in and out of `/swan/autofill/fill-v2`. It doesn't show the prompts, models, profile matching or any answer cache behind it.
- **Not traced end to end:**
  - the Workday step executor (`~contents/crawler/utils/executor`, `MyWorkDay`);
  - the account flow's exact steps;
  - how the panel decides to show its Next/Submit button;
  - whether autofill ever starts on page load without a click (the code has a pagination auto-start; a first-load auto-start wasn't found or ruled out).
- **One version only.** This is v1.25.1. Jobright ships often, and the dormant field finder suggests generic-site support is coming.
- **The Chrome Web Store page** redirect-looped for our fetcher, and the Browser pane refuses the store. Its privacy-practice data types and any "what's new" text were read only through mirrors.
- **Reddit** was read through the Arctic Shift archive API, not reddit.com, so removed posts show titles only.
- **No hands-on test** of Jobright was done. That would need an account, so it was out of scope.

## 9. Recheck before relying on it

- **The code:** Jobright ships often (88 versions, the latest on 2026-10-27). Script names, endpoints, the site list and the dormant field finder may change. Re-read the CRX before quoting §3 for a later version.
- **ATS list:** the "supported ATS" list and the "90%" claim on jobright.ai/job-autofill.
- **Privacy notice:** §6 (AI providers) and §17 (Gmail). Last updated 2026-06-15.
- **Credit limits:** whether autofill is still credit-metered, and the free-tier numbers, which are **[unverified]**.
- **Staff statements on Reddit:** the comments by `jobrightai`, `Jobright_support` and `ComprehensivePie7641` are unofficial; the last account only appears to be staff.

## Sources

All seen on 2026-10-28.

**Shipped extension (primary)**
- The v1.25.1 CRX of `odcnpipkhjegpefkfplmedhmkmmhmoko`, unzipped and read without running it: `manifest.json`, `contents.d42e7fcf.js`, `helper-app.41ea2652.js`, `static/background/index.js`, `field-discovery.d71b3ac3.js`, `ats-submission-resume.81fcb254.js`, `myworkday-submission-network.d7f96e63.js`, `workday-password-sync.26980834.js`, and the other `*-submission-*` scripts.
- https://chrome-stats.com/d/odcnpipkhjegpefkfplmedhmkmmhmoko: stats and permission history
- https://chrome-stats.com/d/odcnpipkhjegpefkfplmedhmkmmhmoko/source: manifest preview
- https://extensionauditor.com/scan/jobright-autofill-instant-job-applications-job-mat-odcnpipkhjegpefkfplmedhmkmmhmoko: version list
- https://chromeboard.com/extension/jobright-autofill-–-insta-odcnpipkhjegpefkfplmedhmkmmhmoko and https://extpose.com/ext/418463: store listing text
- https://chromewebstore.google.com/detail/odcnpipkhjegpefkfplmedhmkmmhmoko: not readable by our fetcher

**Jobright (primary)**
- https://jobright.ai/job-autofill: landing page and FAQ, accordions expanded
- https://jobright.ai/ai-agent: Agent landing page and FAQ
- https://jobright.ai/legal/privacy: privacy notice, last updated 2026-06-15
- https://jobright.ai/blog/supercharge-your-job-search-with-jobright-autofill/ (2025-08-22)
- https://jobright.ai/blog/2025s-best-auto-apply-tools-for-tech-job-seekers/ (2025-08-09)
- https://jobright.ai/blog/jobright-launches-first-ai-agent-to-put-job-search-on-autopilot/ (2025-06-24)
- https://jobright.ai/blog/is-jobright-legit/ (2025-06-18)
- https://github.com/jobright-ai: org repositories, via the GitHub API
- Jobright staff replies on Reddit, via the [Arctic Shift](https://arctic-shift.photon-reddit.com) archive: [1w1qgyd](https://www.reddit.com/r/jobright/comments/1w1qgyd/auto_fill_is_crazy_wish_i_knew_how_it_worked/p7cysi4/), [1ww22c4](https://www.reddit.com/r/jobright/comments/1ww22c4/autofill_extension_uses_info_from_old_resume_on/pejow7l/), [1vnrk02](https://www.reddit.com/r/jobright/comments/1vnrk02/jobright_should_automatically_replace_older/p46bo5c/), [1vampm1](https://www.reddit.com/r/jobright/comments/1vampm1/job_search_automation/p0t9b8w/), [1w4gdd3](https://www.reddit.com/r/jobright/comments/1w4gdd3/i_used_it_for_the_first_time_and_it_was_wonderful/p7cycgy/)
- Trustpilot reply by Jobright on https://www.trustpilot.com/reviews/6abe94908cc53467893d8e85

**Press (independent)**
- https://www.theregister.com/2025/06/24/ai_may_take_jobs_but/

**Users and reviewers (secondary)**
- Reddit, via Arctic Shift: [r/jobsearchhacks 1rpuzhg](https://www.reddit.com/r/jobsearchhacks/comments/1rpuzhg/is_there_a_better_version_of_the_jobright_ai/), [r/recruitinghell 1pex53h](https://www.reddit.com/r/recruitinghell/comments/1pex53h/jobright_agent_sucks/), and r/jobright posts [1t64d1n](https://www.reddit.com/r/jobright/comments/1t64d1n/got_laid_off_in_january_finally_have_an_offer/), [1uel7na](https://www.reddit.com/r/jobright/comments/1uel7na/honest_review/), [1ucn310](https://www.reddit.com/r/jobright/comments/1ucn310/review_of_jobright_platform/), [1wi3dhu](https://www.reddit.com/r/jobright/comments/1wi3dhu/generating_custom_resume_apply_now_still_uploads/), [1rz1jht](https://www.reddit.com/r/jobright/comments/1rz1jht/high_quality/oblsk2w/), [1stxzgb](https://www.reddit.com/r/jobright/comments/1stxzgb/i_like_how_they_autofill_workday_application/), [1u681ul](https://www.reddit.com/r/jobright/comments/1u681ul/anyone_using_this_successfully_with_brave_browser/)
- https://www.trustpilot.com/review/jobright.ai and https://www.trustpilot.com/reviews/6abe94908cc53467893d8e85
- Competitor reviews: https://careery.pro/blog/ai-job-search/jobright-ai-review/ (Careery), https://6figr.com/blog/jobgpt-vs-jobright-ai-which-ai-job-application-tool-actually-works-in-2026-2-593 (JobGPT), https://jobsaicopilot.com/jobright-review/ (JobsAICopilot)
