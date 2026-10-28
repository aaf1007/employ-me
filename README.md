# employ-me

An open-source Chrome extension that fills in job applications from your own profile and keeps track of what you've applied to. It uses your own Claude or Codex subscription.

> **Status:** design phase. There's no code yet.

## How it will work

- **You stay in control.** You open an application form and click **Fill**, then review everything and click Submit yourself. It never submits for you.
- **Rules first, AI second.** Built-in rules fill the fields they recognize. Your own `claude` or `codex` CLI, reached through a small local helper, handles unfamiliar fields and drafts free-text answers for you to accept.
- **Your data stays on your machine.** No accounts, no server, no telemetry.
- **Supported job sites, in order:** Greenhouse, Lever and Ashby first, then Workday. LinkedIn and Indeed are never supported.

## Docs

- [Design (v1)](docs/design.md)
- [Research](docs/research/2026-10-27-landscape.md)
- [Glossary](GLOSSARY.md)
- [Decisions](docs/adr/)

## License

[MIT](LICENSE)
