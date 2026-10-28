# employ-me

An open-source Chrome extension that fills in job applications from your own profile and keeps track of what you've applied to. It uses your own Claude or Codex subscription.

> **Status:** Milestone 1 works on a Mac in Chrome. On 2026-10-28 it filled 12 live Greenhouse, Lever and Ashby applications with real Claude and Codex: every one of 250 fields ended filled, needs review or couldn't fill, and none was silently wrong ([live test](docs/live-test/2026-10-28.md)). Workday is built but unverified. It isn't on npm or the Chrome Web Store yet, so you install it from this repository. Contributors and agents: start with [CLAUDE.md](CLAUDE.md).

## Use it today (Mac, Chrome)

**It uses your plan's limits.** employ-me runs your own logged-in `claude` or `codex` CLI, so every field match, Draft and Resume read counts against your Claude or ChatGPT plan, the same as using the CLI yourself. It never sees your credentials ([ADR-0002](docs/adr/0002-claude-only-through-the-unmodified-cli.md)). It's meant for personal use.

### 1. What you need

- **Node 24** or later, and **pnpm**: run `corepack enable` once (it ships with Node 24) and the repository's pinned pnpm is used.
- **At least one logged-in AI CLI:**
  - Claude: install [Claude Code](https://claude.com/claude-code), run `claude` once and log in.
  - Codex: install the [Codex CLI](https://github.com/openai/codex), run `codex login`.

  Without either, Fills still run on the built-in rules; Drafts and matching unfamiliar fields need one.
- **Google Chrome.**

### 2. Install

```sh
git clone https://github.com/aaf1007/employ-me.git && cd employ-me
pnpm install
pnpm setup:local
```

`pnpm setup:local` builds everything, then runs `employ-me setup`, which:

- copies the helper and the extension to `~/Library/Application Support/employ-me/` (`helper/`, `extension/`, `launcher.sh`, `config.json`, and an empty `work/` folder the CLIs run in, so no project's `CLAUDE.md` is picked up);
- finds your `claude` and `codex` and records their full paths in `config.json` (Chrome started from the Dock has no `PATH`);
- writes Chrome's Native Messaging host manifest, `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.employ_me.helper.json`, and the same for any other Chromium browser you have (Edge, Brave, Arc, Vivaldi, Chromium);
- prints whether each CLI is installed and logged in, and the folder to load.

Nothing else changes: not your shell, not your CLIs' settings, and in Chrome only that `NativeMessagingHosts` folder.

### 3. Load the extension

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose `~/Library/Application Support/employ-me/extension`. The Library folder is hidden in the file picker: press **Cmd+Shift+G**, paste the path, and press Return.
3. Click the puzzle-piece icon in Chrome's toolbar and **pin employ-me**.

### 4. Set up your Profile

1. Click the employ-me icon on any web page. The side panel opens; click **Dashboard**, then **Setup**.
2. If you only have Codex, first open **Settings** and choose Codex as the Provider (Claude is the default).
3. Add your Resume (a PDF or DOCX with selectable text) and click **Read my Resume**. Your Provider reads it once.
4. Check every field it read, then answer the questionnaire: where you apply, your Work Authorization for each country, preferences and salary, screening answers, and Self-ID Answers (they default to "decline", and are never sent to the AI).

### 5. Your first Fill

1. Open a job's application page on Greenhouse, Lever or Ashby (or a company site that embeds one).
2. Click the employ-me icon. The side panel shows the Posting; click **Fill**.
3. Fields are listed under **Filled**, **Needs your review** and **Couldn't fill**, each with its reason (and for Couldn't fill, what to do), and outlined on the page. Required free-text questions get Drafts: edit and accept them, or write your own. Attestations ("I certify…") are always left for you.
4. Check the whole form, then click Submit on the page yourself. employ-me never submits. When the site confirms, or you answer **Did you apply?**, the Application and its Snapshot are in the **Tracker**.

On a company's own careers site (not one of those three), employ-me may read the page only after you click its icon on that page, so open the panel from there before you click Fill.

### Troubleshooting

- `pnpm employ-me doctor` checks the helper, the host manifests, the extension folder, and whether each CLI is found and logged in. It prints the config and log paths, and exits non-zero when something needs fixing.
- The helper's log is `~/Library/Logs/employ-me/helper.log`: events, durations and error reasons, never your Profile values or Drafts.
- **Copy debug report** in the side panel copies what the Fill saw and decided, with your values removed, for an issue.
- Messages in the extension say `npx employ-me …`. Until it's on npm, run the same command from your checkout as `pnpm employ-me …` (and `pnpm setup:local` for setup).

### Update

```sh
git pull
pnpm install
pnpm setup:local
```

Then click the reload arrow on employ-me's card in `chrome://extensions`. Your Profile, Saved Answers and Tracker stay: they live in Chrome, and the extension keeps its ID.

### Uninstall

1. In the dashboard, **Settings → Backup → Export everything** if you want to keep your data. Removing the extension deletes it from Chrome.
2. Click **Remove** on employ-me's card in `chrome://extensions`.
3. Run `pnpm employ-me uninstall`. It removes `~/Library/Application Support/employ-me/` and every host manifest setup wrote, and keeps the log (it prints where).

## How it works

- **You stay in control.** You open an application form and click **Fill**, then review everything and click Submit yourself. It never submits for you.
- **Rules first, AI second.** Built-in rules fill the fields they recognize. Your own `claude` or `codex` CLI, reached through a small local helper, handles unfamiliar fields and drafts free-text answers for you to accept. To match fields, the AI sees their labels and options, never your Profile values. To write a Draft it gets the Profile facts a Draft can use (never Self-ID Answers), and setup gives it your Resume once.
- **Your data stays on your machine.** No accounts, no server, no telemetry.
- **Supported job sites, in order:** Greenhouse, Lever and Ashby first, then Workday. LinkedIn and Indeed are never supported.

## Coverage

**Live, 2026-10-28.** 12 public Postings, filled with the real helper and real Claude and Codex ([details](docs/live-test/2026-10-28.md)). "Silently wrong" counts fields the first passes got wrong without flagging them; all four were fixed and re-checked on the same live forms.

| ATS | Postings | Fields | Filled | Needs review | Couldn't fill | Silently wrong |
|---|---|---|---|---|---|---|
| Greenhouse (one embedded in a company site) | 4 | 99 | 78 | 4 | 17 | 0 |
| Lever | 4 | 87 | 52 | 4 | 31 | 3 → 0 |
| Ashby | 4 | 64 | 35 | 12 | 17 | 1 → 0 |
| **Total** | **12** | **250** | **165** | **20** | **65** | **4 → 0** |

**Recorded forms, rules only.** How much of each supported job site's forms the built-in rules fill on their own (the AI unavailable), measured on real forms recorded on 2026-10-28 with a test Profile. Workday's forms sit behind a sign-in for each employer, so its row is measured on forms built by hand from Workday's public code: it is unverified until a live pass. Every field the rules don't fill is marked "Needs review" or "Couldn't fill", with the reason and a fix. Attestations are never ticked, so they always count as "Couldn't fill". `pnpm fill-rate --write` regenerates this table.

<!-- fill-rate:start -->
| ATS | Forms | Fields | Filled | Needs review | Couldn't fill | Fill rate |
|---|---|---|---|---|---|---|
| Greenhouse | 5 | 126 | 90 | 4 | 32 | 71% |
| Lever | 3 | 53 | 41 | 0 | 12 | 77% |
| Ashby | 5 | 83 | 43 | 8 | 32 | 52% |
| Workday (synthetic forms: unverified until a live pass) | 3 | 110 | 79 | 0 | 31 | 72% |
| Generic fallback | 1 | 14 | 8 | 1 | 5 | 57% |
<!-- fill-rate:end -->

## Docs

- [Design (v1)](docs/design.md)
- [Research](docs/research/2026-10-27-landscape.md)
- [Glossary](GLOSSARY.md)
- [Decisions](docs/adr/)
- [Coding standards](CODING_STANDARDS.md)
- [Build log](docs/BUILD_LOG.md)
- [Live test, 2026-10-28](docs/live-test/2026-10-28.md)

## License

[MIT](LICENSE)
