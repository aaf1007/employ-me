# employ-me

An open-source Chrome extension that fills in job applications from your own profile and keeps track of what you've applied to. It uses your own Claude or Codex subscription.

> **Status:** early development. The foundation (packages, boundary lint rules, test harness) is in place, but nothing works end to end yet. Contributors and agents: start with [CLAUDE.md](CLAUDE.md).

## How it will work

- **You stay in control.** You open an application form and click **Fill**, then review everything and click Submit yourself. It never submits for you.
- **Rules first, AI second.** Built-in rules fill the fields they recognize. Your own `claude` or `codex` CLI, reached through a small local helper, handles unfamiliar fields and drafts free-text answers for you to accept.
- **Your data stays on your machine.** No accounts, no server, no telemetry.
- **Supported job sites, in order:** Greenhouse, Lever and Ashby first, then Workday. LinkedIn and Indeed are never supported.

## Coverage

How much of each supported job site's forms the built-in rules fill on their own (the AI unavailable), measured on real forms recorded on 2026-10-28 with a test Profile. Every field the rules don't fill is marked "Needs review" or "Couldn't fill", with the reason and a fix. Attestations are never ticked, so they always count as "Couldn't fill". `pnpm fill-rate --write` regenerates this table.

<!-- fill-rate:start -->
| ATS | Forms | Fields | Filled | Needs review | Couldn't fill | Fill rate |
|---|---|---|---|---|---|---|
| Greenhouse | 5 | 126 | 90 | 4 | 32 | 71% |
| Lever | 3 | 53 | 41 | 0 | 12 | 77% |
| Ashby | 3 | 42 | 28 | 0 | 14 | 67% |
| Generic fallback | 1 | 14 | 8 | 1 | 5 | 57% |
<!-- fill-rate:end -->

## Docs

- [Design (v1)](docs/design.md)
- [Research](docs/research/2026-10-27-landscape.md)
- [Glossary](GLOSSARY.md)
- [Decisions](docs/adr/)
- [Coding standards](CODING_STANDARDS.md)
- [Build log](docs/BUILD_LOG.md)

## License

[MIT](LICENSE)
