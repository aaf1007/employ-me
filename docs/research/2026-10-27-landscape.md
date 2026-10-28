# Landscape research: open-source AI job-application autofill (2026-10-27)

This is a research snapshot from 2026-10-27. Anthropic's and OpenAI's rules on subscriptions changed several times in 2026, so recheck §3 before any release. Anything marked **[unverified]** came from a single source or from secondary sources only.

## TL;DR

1. **The gap is real.**
   - No open-source Chrome extension for this has real traction; every one has fewer than ~130 real stars.
   - The commercial tools are big but expensive: Jobright has 300K Chrome users and Simplify Copilot has 600K, and both charge about $40/month for their AI features.
   - Users' top complaints: AI answers that are wrong or made up, fields left blank without a warning, paywalls and credit limits, and poor results on Workday.
2. **People already use their own Claude Code or Codex for job hunting.**
   - The biggest open-source projects of 2026 are command-line workflows, not extensions: career-ops (~78K★) and ai-job-search (~67K★).
   - They run on the user's own Claude Code or Codex login.
   - None of them is a polished in-browser autofill.
3. **Using a subscription is allowed, with care.**
   - **OpenAI** is permissive. Local, open-source tools may use the Codex CLI login. "Sign in with ChatGPT" has been official for open-source apps since 2026-09-29.
   - **Anthropic** is strict:
     - Touching Claude login tokens, or offering a "Log in with Claude" button, is prohibited.
     - Calling the user's own unmodified `claude -p` CLI, which they logged into themselves, is a tolerated grey zone.
     - The user's own Claude Code driving the browser through an MCP server is clearly allowed.
4. **The extension needs a local helper.** A Manifest V3 extension cannot start local programs, so reaching `claude` or `codex` requires a **Native Messaging host**: a small local binary plus a one-time installer.
5. **~7 ATSs cover ~85% of new-grad and intern postings:**
   - Workday: 22–47%
   - Greenhouse: ~16–24%
   - Ashby: ~5–21%
   - Then iCIMS, Oracle Recruiting Cloud, Lever and SmartRecruiters
   - Lever, Greenhouse and Ashby are easy. Workday is the hardest and the most important.
6. **Recommended design:**
   - Fixed, per-site code does the reading and filling.
   - The LLM does three jobs:
     - match unknown field labels to profile fields (it sees labels only, never your personal data);
     - pick from an option list when matching fails;
     - draft free-text answers for you to review.
   - It never clicks Submit and never touches LinkedIn or Indeed.

---

## 1. Commercial tools

| Product | Chrome users / rating | Autofill | Tracking | Paid tier | Main complaints |
|---|---|---|---|---|---|
| **Jobright** | 300K / 4.9 | Profile fields + AI answers; claims support for Workday, Greenhouse, Lever, iCIMS, Ashby, Workable | Built in; unclear whether submissions are auto-detected **[unverified]** | Turbo $39.99/mo, or $17.99/wk | Wrong answers to custom questions; made-up resume content; low real fill rate; rising prices; spam emails; US-centric |
| **Simplify Copilot** | 600K / 4.8 | Profile fields on "100+ ATS", free and unlimited; AI answers are paid (Simplify+) | Asks after you submit through Copilot; otherwise manual add or CSV import | Simplify+ $39.99/mo (includes Autopilot: 20 applications/wk, fails rather than guesses) | Workday "brittle"; fields left blank with no notice; billing and refunds |
| **Teal** | 200K / 4.7 | Mostly bookmarking jobs | Manual Kanban board | ~$29/mo | Little automation |
| **Huntr** | 90K / 4.6 | Autofill on "top ATS" | Web clipper + Kanban board | $40/mo | Workday issues |
| **Careerflow** | 200K / 4.3 | Limited | Saves jobs from 45+ job boards | $24–45/mo | Bugs |
| **LazyApply / JobCopilot / Massive** | Mass auto-apply | n/a | Dashboard | $28–99/mo | Refunds; irrelevant applications |

Market signals worth noting:
- **Workday Candidate Profile** was announced 2026-10-13, with general availability in early 2027. It pre-fills about 80% of standard Workday fields, so plain field-filling on Workday becomes a commodity. Lasting value will come from custom answers, tracking and tailoring.
- **Greenhouse "MyGreenhouse Quick Apply"** is Greenhouse's own autofill.
- **Greenhouse Real Talent** (CLEAR identity verification) and **Ashby fraud detection** show employers pushing back on spray-applying.

Main sources:
- [Jobright on the Chrome Web Store](https://chromewebstore.google.com/detail/odcnpipkhjegpefkfplmedhmkmmhmoko)
- [Simplify llms.txt](https://simplify.jobs/llms.txt)
- [Simplify tracker help](https://help.simplify.jobs/articles/2140179-using-the-job-tracker)
- [Simplify autofill settings](https://help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension)
- [Workday Candidate Profile](https://newsroom.workday.com/2026-10-13-New-Workday-Candidate-Profile-Lets-Job-Seekers-Save-Their-Information-Once-and-Use-It-Every-Time-They-Apply-Through-Workday)
- Pricing and complaint data comes from review blogs, many of them written by competitors ([careery](https://careery.pro/blog/ai-job-search/jobright-ai-review), [jobstrack](https://jobstrack.io/blog/jobright-review-2026), Trustpilot), so treat it as directional.

## 2. Open-source projects

| Repo | ★ | License | Approach | Uses your subscription? | Status |
|---|---|---|---|---|---|
| [career-ops](https://github.com/career-ops-hq/career-ops) | ~78K | MIT | Runs inside an AI coding CLI; Playwright apply mode for Ashby, Greenhouse, Lever, Workable | **Yes** (Claude Code, Codex, OpenCode…) | Very active |
| [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search) | ~67K | MIT | Claude Code workflow + Gmail status sync | **Yes** (Claude plan or API) | Active; Danish job boards |
| [Resume-Matcher](https://github.com/srbhr/Resume-Matcher) | ~29K | Apache-2.0 | Self-hosted resume tailoring + MCP | **Yes**: runs the installed `claude` CLI, and offers Sign in with ChatGPT | Active |
| [jobsync](https://github.com/Gsync/jobsync) | ~1.5K | MIT | Self-hosted tracker; pulls jobs from Greenhouse, Lever and Ashby | No (Ollama or API keys) | Active |
| [freehire](https://github.com/strelov1/freehire) | ~3.3K | MIT | Side-panel extension with a reliable dropdown-filling helper; profile stored on their server | No | Active, good code to learn from |
| [JobNavigator](https://github.com/vesaias/JobNavigator) | 166 | MIT | Docker + Playwright, 13 ATS handlers | **Yes** (Claude or Codex CLI) | Small |
| [job-apply-plugin](https://github.com/neonwatty/job-apply-plugin) | 131 | MIT | Claude Code / Codex plugin that drives a browser | **Yes** | Small |
| [workday-autopilot](https://github.com/ShahaanK/workday-autopilot) | small | n/a | Workday-focused; documents Workday's page structure | n/a | Useful notes on Workday's page structure |
| [Autofill-Jobs](https://github.com/andrewmillercode/Autofill-Jobs) | 36 | MIT | Hand-written field mappings per ATS | No | Unmaintained; has a known React-input bug |
| AIHawk | (32K, now [renamed](https://github.com/feder-cr/invisible_dots)) | MIT | Selenium bot for LinkedIn | No | **Dead as a job bot** |

Lessons:
- **Automating LinkedIn kills projects.** AIHawk removed its LinkedIn features after legal threats (January 2025), and its stars now point at an unrelated project.
- **Script-driven clicks can trigger CAPTCHAs.** Lever shows an hCaptcha when checkboxes or radio buttons are clicked by script. career-ops leaves those controls for the user to click.
- **Some star counts are fake.** FormFilla shows 3.6K★ but has 0 forks and 23 Chrome Web Store users.
- **Open-core projects tend to drift into paid products** (wodsuz, AIHawk → Laboro).

Building blocks:
- [JobSpy](https://github.com/speedyapply/JobSpy): job-board scraper
- [JSON Resume schema](https://jsonresume.org/schema): base for the profile schema
- [reactive-resume](https://github.com/reactive-resume/reactive-resume): resume builder

## 3. Using your own Claude or Codex subscription

### 3.1 Policy

Three ways a tool could use your subscription:
- **(a)** The tool reads or reuses the login token itself.
- **(b)** The tool runs your own, unmodified `claude` or `codex` program, which you logged into yourself.
- **(c)** Your own Claude Code or Codex drives the browser through an MCP server that the tool provides.

| Approach | Anthropic (Claude Pro/Max) | OpenAI (ChatGPT Plus/Pro) |
|---|---|---|
| **(a)** Read or reuse the login token; run your own OAuth flow; impersonate the official client | **Prohibited.** Tools doing this are actively blocked and billed as extra usage. | Tolerated in the past; replaced by Sign in with ChatGPT (SIWC) |
| **(b)** Run the user's own `claude -p` / `codex exec` / `codex app-server` | **Grey area, tolerated.** Anthropic's support notes say `claude -p` and Agent SDK usage still count against plan limits; a planned change to bill them separately was paused on 2026-06-15. | **Allowed** for local and open-source use. Never allowed for commercial or hosted products. |
| **(c)** The user's own Claude Code or Codex drives the browser through MCP | **Allowed.** This is ordinary Claude Code use. | **Allowed** |
| Official "sign in" for third-party apps | Not offered. Third parties may not offer Claude.ai login. | **SIWC**, since 2026-09-29. Open-source and local apps may use plan usage without approval. Users can cap each app's weekly use **[unverified]**. |

Key events:
- **2026-01-09:** Anthropic cracked down on third-party tools (harnesses) that impersonate Claude Code.
- **2026-02-19:** The legal page was clarified. Developers may not route requests through users' subscription credentials, but an end user signing in to the unmodified Claude Code binary is fine.
- **2026-03-19:** OpenCode removed Claude login after legal requests from Anthropic.
- **2026-06-15:** A planned separate monthly credit for `claude -p` and the SDK was paused, not cancelled.

Sources:
- [Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK with your plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [The Register, 2026-02-20](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access)
- [OpenCode PR #18186](https://github.com/anomalyco/opencode/pull/18186)
- [SIWC overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [SIWC cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)

Risks to watch on the Claude side:
- **Wording:** "unless previously approved" in the SDK docs reads broadly.
- **Billing:** the paused separate-credit plan could come back, which would leave Pro users about $20/month for this usage.
- **Login:** `--bare` is slated to become the default for `-p` mode, and `--bare` does not read the subscription login.
- **Escape hatch:** Max 5x and 20x plans now include $100 and $200/month of API credits ([support](https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans)). That gives Max users a fully sanctioned path through an API key.

### 3.2 Calling the CLIs headlessly

**Claude** ([headless docs](https://code.claude.com/docs/en/headless), [CLI reference](https://code.claude.com/docs/en/cli-reference)):

```
claude -p --output-format json --json-schema '<schema>' --model sonnet \
  --tools "" --strict-mcp-config --setting-sources "" --disable-slash-commands \
  --no-session-persistence --system-prompt-file <file>  < /dev/null
```

- Read the result from `structured_output`.
- Remove `ANTHROPIC_API_KEY` from the environment, or the CLI uses it instead of the plan.
- The user must have run `claude` interactively once to log in, because `/login` isn't available in `-p` mode.
- Without the lean flags above, the user's own plugins and MCP servers inflate token use a lot. Measured: a trivial call cost about $0.31 equivalent instead of about $0.0002.
- `--input-format stream-json` or the Agent SDK can keep one warm session open.

**Codex** ([non-interactive docs](https://learn.chatgpt.com/docs/non-interactive-mode)):

```
codex exec --json --output-schema schema.json --ephemeral --skip-git-repo-check --ignore-user-config -m <model>
```

- `codex app-server` speaks JSON-RPC over stdio. Useful methods: `thread/start`, `turn/start` with `outputSchema`, and `account/rateLimits/read`, which can show the user their remaining quota.
- [`@openai/codex-sdk`](https://github.com/openai/codex/tree/main/sdk/typescript) wraps the CLI and works with a ChatGPT login.
- Each call sends about 17K input tokens of Codex's built-in instructions. A persistent app-server avoids starting the program over for every call.

**Measured** on this machine (2026-10-27, one run each, mapping 40 fields with a schema):

| Provider and model | Time |
|---|---|
| Claude Sonnet | ~8.2 s |
| Claude Haiku | ~9.9 s |
| Codex, small model | ~7.9 s |
| Codex, default model at low effort | ~16.5 s |

### 3.3 How the extension reaches the CLI

| Option | Pros | Cons |
|---|---|---|
| **Native Messaging host** (recommended) | Only our extension can talk to it; no open port; Chrome starts it on demand; `connectNative` keeps one process warm and keeps the extension's background worker alive | Needs a separate installer that writes a manifest file for each browser; the extension ID must be fixed via the `key` field; Chrome started from the Dock doesn't see the shell `PATH`, so the installer must record absolute paths to `claude` and `codex`; messages from host to extension max out at 1 MB |
| Localhost HTTP/WebSocket server | One server works for every browser | Must stay running; port clashes; needs pairing, Origin checks and DNS-rebinding protection |
| Inverted: Claude Code or Codex drives the browser through MCP | Clearest policy position | Workflow lives in a terminal; slow and uses many tokens (multiple turns, screenshots); an agent-driven browser scored <5% on the [FormFactory benchmark](https://arxiv.org/abs/2506.01520) |

Manifest locations, per user:
- **macOS:** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- **Linux:** `~/.config/google-chrome/NativeMessagingHosts/`
- **Windows:** registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\<name>`
- **Edge, Brave, Arc, Vivaldi, Chromium:** each has its own equivalent folder.

See the [Chrome native messaging docs](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

### 3.4 Will the plan limits hold up?

- **Assumption:** 30 applications/day at 2–4 short calls each is 60–120 calls, roughly 300–450K tokens a day (about $1–3 at API prices).
- **Claude Pro / ChatGPT Plus:** that fits if spread across the day.
- **Max / ChatGPT Pro:** comfortable.
- **Agent-driven browsing** would likely use up Pro or Plus windows. An estimated 50–200K tokens per application is a guess, not a measurement.

## 4. ATS landscape

Share of application links in the [SimplifyJobs New-Grad](https://github.com/SimplifyJobs/New-Grad-Positions) and [Summer2026-Internships](https://github.com/SimplifyJobs/Summer2026-Internships) lists, classified by URL on 2026-10-27:

| ATS | New grad (by posting, n=550) | Intern (by posting, n=1,788) | Difficulty |
|---|---|---|---|
| Workday | 32% | 47% | **Hard** |
| Greenhouse | 20% | 16% | Easy–medium |
| Ashby | 12% | 5% | Easy–medium |
| iCIMS | 6% | 4% | Hard |
| Oracle Recruiting Cloud | 4% | 8% | Hard |
| Lever | 6% | 2% | Easiest |
| SmartRecruiters | 2% | 2% | Medium–hard |

Data for wider markets:
- **Fortune 500** ([Jobscan, Aug 2026](https://www.jobscan.co/blog/fortune-500-use-applicant-tracking-systems/)): Workday over 40%, SuccessFactors 12%.
- **All companies** (same source): Greenhouse 19%, Workday 17.5%, Lever 15.6%, iCIMS 14.4%.

How each ATS behaves:
- **Greenhouse**
  - URL: `job-boards.greenhouse.io/{board}/jobs/{id}`. It is often embedded in a company site as `iframe#grnhse_iframe`, with `?gh_jid=` on the parent page.
  - Single page with no login. Field ids match API names (`first_name`, `question_{id}`).
  - Every dropdown is a react-select. Invisible reCAPTCHA is used.
- **Lever**
  - URL: `jobs.lever.co/{co}/{uuid}/apply`.
  - Rendered on the server, with stable field `name`s.
  - A hidden `cards[...][baseTemplate]` input holds each question's text, type and options as JSON.
  - Uploading a resume triggers a parse that overwrites fields already filled.
  - Uses hCaptcha.
- **Ashby**
  - URL: `jobs.ashbyhq.com/{org}/{uuid}/application`. Elements carry `[data-field-path]` (`_systemfield_*`).
  - Yes/No answers are buttons sitting over a hidden checkbox.
  - The form schema can be read from an internal GraphQL endpoint, which is undocumented.
- **Workday**
  - URL: `{tenant}.wd{N}.myworkdayjobs.com/...`.
  - **Every employer requires its own account.**
  - 5–7 steps: My Information → My Experience → Application Questions → Voluntary Disclosures → Self-Identify → Review.
  - Elements carry `data-automation-id` attributes. The id scheme is changing (`legalNameSection_firstName` → `name--legalName--firstName`), so support both.
  - Dropdowns ("prompt" widgets) need an Enter key event with `keyCode` forced to 13.
  - Date spin buttons, repeating sections numbered by a global counter, option lists that differ per employer, and skills chosen from a catalog.
- **iCIMS:** content sits inside `#icims_content_iframe`; login; older markup.
- **Oracle Recruiting Cloud (ORC):** email, then a verification code or PIN, then an Oracle JET single-page app.
- **SmartRecruiters**
  - The **whole form lives inside shadow DOM** (an encapsulated part of the page that normal searches can't see).
  - Events need `composed:true`, and there are two resume inputs **[unverified]**.
- **LinkedIn Easy Apply and Indeed:** their terms explicitly forbid automation. **Exclude them.**

**General rule:** when an ATS offers to "autofill from resume", upload first, wait for the parse to finish, and only then fill.

## 5. Implementation techniques (Manifest V3)

- **Setting values on React/Vue/Angular inputs:**
  - Call the prototype value setter: `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v)`.
  - Then dispatch `input` and `change` (bubbles, composed), then `focusout`.
  - Read the value back to check it stuck.
- **Dropdowns (comboboxes):**
  - Send pointerdown → mousedown → mouseup → click to open.
  - Type to filter, wait for `[role=option]`, then click the best match.
  - freehire's `combobox.ts` (MIT) is a good reference.
- **Resume files:** build a `DataTransfer`, set `input.files = dt.files`, then dispatch `change`.
  - Works from the content script on Greenhouse, Lever and Workday.
  - `chrome.debugger` is a fallback only: it shows a warning bar and draws Web Store review scrutiny.
- **Iframes:**
  - A content script matched to the ATS host with `all_frames:true` runs inside the embedded iframe without needing access to the parent site.
  - `activeTab` does not cover cross-origin iframes **[unverified, forum answer]**, so embedded ATSs need host permissions.
- **Shadow DOM:** walk the page tree recursively. Use `chrome.dom.openOrClosedShadowRoot` for closed shadow roots.
- **Background worker lifetime:** Chrome stops the extension's background service worker after 30 s idle. Run long or streaming work from the side panel, or over a `connectNative` port.
- **Remote code ban:** all code must ship inside the extension package. Remote JSON *data* such as selector overrides is fine, but a remote "recipe language" is a grey area. Treat LLM output strictly as data.
- **Permissions:**
  - Declare host permissions for the known ATS domains.
  - Use `optional_host_permissions: ["https://*/*"]`, requested per site when the user clicks.
  - Avoid `<all_urls>`, `debugger`, `tabs` and `cookies`; each slows Web Store review.
  - Note that both incumbents run on every site and hold `cookies`.

## 6. How fields get understood

What others do:
- Pure LLM (openapply): fragile, and sends your personal data on every call.
- Hand-written maps (Autofill-Jobs).
- Synonym tables plus a dropdown helper (JobNavigator, freehire).
- A matching cascade, with the LLM as the last step (workday-autopilot).
- Simplify: profile matching for free; AI answers paid; saves custom answers by their label.

Recommended pipeline:
1. **Detect** the ATS from the URL and page structure, then pick a site adapter or the generic engine.
2. **Extract** each field as `{id, label, section, type, options[], required, maxLength}`.
3. **Classify with fixed rules first:** adapter map → about 80 standard field types (via `autocomplete` tokens, regexes and synonyms) → exact match against the saved-answers bank.
4. **LLM for leftovers:** one batched call per page.
   - It receives labels and options only, with **no personal data**.
   - It returns, per field, a profile field, a saved answer, "needs draft" or "unknown".
   - Cache results by `(ats, normalized label)`.
5. **Choose options** in order: exact → normalized → synonym → token overlap → LLM picks from the list.
6. **Draft free text** in the side panel, grounded in the profile, the saved answers and the job description.
   - Show where each claim comes from, and flag anything unsupported.
   - Insert only after the user accepts it, then save the edited answer back to the bank.
7. **Fill and verify:** highlight fields as filled, uncertain or unanswered. **Never press Submit.**

| Always handled by fixed rules | LLM allowed |
|---|---|
| Contact, links, address, phone, history, dates, GPA, files | Classifying unknown labels (no personal data sent) |
| Work authorization, sponsorship, salary (your explicit answers) | Choosing an option when matching fails |
| EEO, veteran, disability, criminal history, consent/attestation boxes, signatures (never ticked automatically) | Drafting answers and cover letters; fitting saved answers to length limits |

**Employer AI policies:** some applications now ask about AI use. Anthropic's Greenhouse form has an "AI Policy for Application" question, and its [candidate guidance](https://www.anthropic.com/candidate-ai-guidance) wants the first draft written by you. The extension should detect these questions and switch from "draft for me" to "polish my draft".

**Profile schema:** start from JSON Resume and add:
- Legal and preferred name, phone in international format, address split into parts.
- Work authorization per country, with sponsorship now or later.
- Relocation and remote preferences, start date, graduation date.
- Education and work history with month/year dates.
- Skills with aliases.
- Several resume versions.
- EEO answers, defaulting to "decline" and opted into per field. **These never go to the LLM.**
- Salary rules.
- "How did you hear about us" default.
- A saved-answers bank: question, variants, answer, tags, per-company overrides, source.

## 7. Application tracking

- **Detecting a submission:** a click on the final Submit, plus a confirmation signal within about 15 s.
  - Greenhouse: `/confirmation`
  - Lever: `/thanks`
  - Ashby: `.ashby-application-form-success-container` appears
  - Workday: `applicationSubmittedDialog` **[unverified]**
  - iCIMS and SmartRecruiters: **[unverified]**
  - Fallback: a `PerformanceObserver` watching network requests, or a "Did you apply?" prompt.
- **Job details from public APIs (no auth needed):**
  - Greenhouse: `boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?questions=true&pay_transparency=true`
  - Lever: `api.lever.co/v0/postings/{co}?mode=json`
  - Ashby: `api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true`
  - Workday: the CXS endpoint
  - Fallback: schema.org `JobPosting` JSON-LD on the page
- **Snapshot at apply time:** save the job description (postings disappear), the answers actually submitted, and which resume version was sent.
- **De-duplication:**
  - Key on `(ats, tenant/board, jobId)`. On Workday, use `jobReqId` (the `-1`/`-2` suffixes are the same requisition).
  - Strip tracking parameters from URLs.
  - Otherwise fuzzy-match company, title and location within 30 days.
- **Gmail status tracking is expensive to ship.** Every Gmail scope that can read mail is "restricted", which means Google verification, plus a yearly security assessment if mail data touches a server. Options: leave it out of v1, or let users bring their own Google Cloud OAuth client.

## 8. Risks and policy

- **Chrome Web Store:**
  - The single purpose ("assist with filling out and tracking your job applications") covers both features.
  - Limited Use policy: sending form content to an LLM is allowed if disclosed, but a privacy policy is required.
  - Since 2026-08-01, collection must be *strictly necessary*.
  - The spam policy forbids sending things on the user's behalf without confirmation, which is another reason never to auto-submit.
- **LinkedIn** (User Agreement §8.2) and **Indeed** (terms updated 2026-09-29) explicitly ban automation. No content scripts on those sites.
- **CAPTCHAs:** reCAPTCHA (Greenhouse, Ashby), hCaptcha (Lever), emailed codes (Greenhouse) and PINs (ORC). Never solve or bypass them; hand those steps to the user.
- **What employers think:**
  - Greenhouse's 2025 survey: 68% of job seekers use AI and 82% of employers screen with it ([Fortune](https://fortune.com/2025/11/18/hiring-job-seekers-recruiters-talent-acquisition-ai-doom-loop-application-technology)).
  - About 1 in 5 hiring managers reject AI-written materials ([TopResume](https://topresume.com/career-advice/ai-in-hiring-survey)).
  - Invented experience is the dealbreaker.
- **Assistant vs. bot:**
  - Assistant: one application at a time, user present, user reviews what was filled, user clicks Submit.
  - Bot: auto-submit, bulk or background applying, invented content, ticking attestation boxes.

## 9. Where an open-source, bring-your-own-subscription tool can win

1. **Answers grounded in your facts, never invented.** Every drafted sentence traces back to your profile or saved answers, and anything unsupported is flagged. This targets the #1 complaint about Jobright.
2. **No paywall and no credits.** Your own plan pays for the AI.
3. **Local data and minimal permissions.** No backend, no telemetry, no `<all_urls>`, no `cookies` permission.
4. **A tracker that records what you actually sent:** the job description, your answers and the resume version.
5. **Honest coverage.** Each ATS has its own adapter with fixture tests and a public fill-rate table. Any field that was skipped is listed, never silently left blank.
6. **Screening before you apply.** Flag knock-out questions (sponsorship, degree, years of experience), and check that the posting is still live and not a ghost job.
7. **Human clicks Submit, and LinkedIn is never automated.** This avoids AIHawk's fate.

## 10. Recheck before relying on it

- Anthropic's position on (b) has no explicit approval, and the legal pages carry no dates.
- `--bare` becoming the default for `-p`.
- The separate-credit billing plan, which is paused, not cancelled.
- SIWC: per-app caps, structured-output support, and whether the loopback login flow works when started from a native host.
- Workday's old vs. new `data-automation-id` naming across employers.
- Confirmation selectors for Workday, iCIMS and SmartRecruiters.
- Ashby's GraphQL endpoint, which is undocumented.
- Whether `activeTab` covers iframes.
- Whether `claude`, started by Chrome's native host, can read the macOS Keychain (untested).
- SuccessFactors' real share among tech employers, which is hidden behind custom domains.
