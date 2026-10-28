# employ-me v1 design

Agreed 2026-10-27. Terms in **bold** are defined in [GLOSSARY.md](../GLOSSARY.md). The evidence behind these choices is in [research](research/2026-10-27-landscape.md).

## What it is

- **An assistant, not a bot.** You start every **Fill**, review it, and click Submit yourself. No auto-submit and no bulk applying. LinkedIn and Indeed are never supported.
- **Who it's for.** Built for one person's daily use first. It is public on GitHub (MIT) from day one, and anyone can install it with one command. A Chrome Web Store listing comes later.
- **v1 scope** is autofill plus the **Tracker**. Not in v1: job discovery, match scores, resume tailoring, cover-letter files, referrals, and Gmail status sync.
- **Your data stays on your machine.**
  - Everything lives in the browser. You can export and import it as JSON or CSV.
  - No server, no account, no telemetry.
  - Network traffic goes only to the job site, the job site's public job APIs (for **Snapshots**), and your **Provider** through the helper.
  - "Copy debug report" strips your values before copying.

## AI

- **Providers** are Claude and Codex only, each through your own logged-in CLI.
  - No API keys or local models in v1, but the Provider boundary keeps them cheap to add.
- **The helper.** A small local program, installed by `npx employ-me setup`, runs `claude -p` and `codex app-server`. Chrome reaches it through Native Messaging ([ADR-0001](adr/0001-local-helper-runs-your-own-cli.md)).
- **Claude rules** ([ADR-0002](adr/0002-claude-only-through-the-unmodified-cli.md)):
  - We never touch Claude credentials.
  - The stock CLI runs with your own plugins, MCP servers and settings turned off.
  - The README says plainly that this uses your plan's limits.
- **Default models**, which you can change:
  - Claude: Sonnet for everything.
  - Codex: the default model, with low effort for matching fields.
- **The AI never blocks a Fill.** If it's unavailable, the built-in rules still fill what they recognize. Fields that needed the AI go to "Couldn't fill" with the reason and the fix.
- **Job descriptions are untrusted text.** Providers run with every tool turned off, and every **Draft** gets your review.

## Filling

**Starting a Fill**
- Nothing happens when a page loads. You click the toolbar icon, the side panel detects the **Application Form**, and you click Fill.
- One Fill carries on through each later step as you click Next.

**What you see**
- The side panel lists fields under Filled, Needs your review, and Couldn't fill.
- The same fields get matching outlines on the page.
- Nothing is injected into job sites' own pages.

**Who fills what**
- Built-in rules fill the fields they recognize.
- The AI sees field labels and options only, never your data. It uses them to match unfamiliar fields, and to choose an option when the rules can't.
- **Saved Answers**: if a question matches word for word (ignoring case and punctuation), the answer fills automatically. If the AI only finds a similar one, it goes to review.

**Drafts**
- Required free-text questions are drafted during the Fill, all at once. Optional ones get a Draft button.
- Drafts are based on your **Profile**, your Saved Answers and the **Posting**.
- Claims that don't come from your information are flagged.
- Nothing goes into the form until you accept it. Your accepted version becomes a Saved Answer.
- Each Draft is written in the language of its question.
- **Special cases:**
  - **AI-use policy questions:** if the form has one, drafting switches to "polish my draft".
  - **Cover-letter fields:** left empty and flagged, but the Draft button still works on them.

**Sensitive questions**
- **Self-ID Answers** and **Attestations** are never sent to the AI.
- Self-ID questions are filled only from your own answers, which default to "decline".
- Attestations are never ticked automatically.
- Questions about facts or willingness ("Willing to do a background check?") are filled from your Profile.

**Country-specific answers**
- **Work Authorization** and Self-ID Answers are picked by the Posting's country.
- If the country is unclear, the question goes to review with each country's answer shown side by side.
- The sponsorship answer for each country is Yes, No, or Ask me each time.

**Sign-in pages**
- employ-me never fills, stores or creates passwords, and never creates accounts. At most it fills in your email.
- Email codes, PINs and CAPTCHAs are always up to you.

**Resumes**
- You keep labelled **Resumes**, with one marked as default, and can switch for a single Application.

## Profile

**Setup**
1. Add a Resume. Your Provider reads it once and pre-fills the Profile.
2. You review every field.
3. A questionnaire covers the rest: which countries you apply in, Work Authorization, preferences, salary for each country, screening defaults, and Self-ID Answers.

**What the Profile holds**
- **Identity:** legal and preferred name, 18 or older.
- **Contact:** email; phone with country code and type.
- **Address:** one address.
- **Links:** LinkedIn, GitHub, portfolio.
- **Work Authorization, for each country:**
  - citizenships, whether you're authorized now, and your status;
  - sponsorship (Yes / No / Ask me each time);
  - an optional explanation;
  - US only: whether you're a "U.S. person".
- **Preferences:** relocation, work model, start date, notice period, salary for each country in its currency.
- **Background:** work history; education, with an optional GPA; skills; languages with proficiency.
- **Files:** labelled Resumes.
- **Self-ID Answers** for each country.
- **Common screening answers:** how you heard about the job, whether you were referred, whether you've worked there before (remembered per company), background-check willingness, non-compete.
- **Saved Answers.**

**Never stored:** SIN/SSN, passwords, references, signatures, date of birth.

**Later:** pronouns, multiple addresses, certifications/projects/awards, security clearance, drug test, driver's licence, travel percentage.

## Tracking

- **When an Application is created.** Only when one of these happens:
  - the job site shows its confirmation;
  - you say yes to "Did you apply?";
  - you add it by hand or import it from a CSV.
- **What each Application holds:**
  - a Snapshot: the Posting's description, the answers you submitted, and the Resume you used;
  - your notes;
  - a **Status** that you change: Applied → Interviewing → Offer / Rejected / Withdrawn.
- **Already-applied warning.** It appears when you open a Posting you've already applied to: the same job site, employer and job id.
- **Tracker features:** search, filter by Status and company, CSV export. No reminders, calendar or contacts.

## Job sites

| Order | Job sites |
|---|---|
| Milestone 1 | Greenhouse (including forms embedded in company sites), Lever, Ashby, plus a generic fallback that lists what it couldn't fill |
| Milestone 2 | Workday |
| Later | SuccessFactors, then iCIMS, Oracle, SmartRecruiters |
| Not planned | GC Jobs |
| Never | LinkedIn, Indeed |

Each supported job site gets saved copies of real forms as test fixtures. The README shows a public table of how well each site is covered.

## Tech

- **Code:** a TypeScript monorepo. The extension uses WXT with React. The helper is TypeScript, published on npm.
- **Browsers:** Chrome plus other Chromium browsers (Edge, Brave, Arc, Vivaldi). No Firefox or Safari in v1.
- **Install:** `npx employ-me setup` installs the helper, finds your CLIs, and drops the extension folder on disk. You then "Load unpacked" in Chrome. To update, re-run it with `@latest`.
- **Language:** the UI is English. The built-in rules match English only; the AI handles French labels.

## Milestone 1 is done when

On a Mac, in Chrome, you can:
- install with `npx employ-me setup`;
- set up your Profile;
- Fill real Greenhouse, Lever and Ashby applications, with every field either filled correctly or flagged, and none silently wrong;
- get Drafts from both Claude and Codex;
- submit, then see the Application and its Snapshot in the Tracker;
- get the already-applied warning when you come back to that Posting.

Windows and Linux support come before announcing it publicly.
