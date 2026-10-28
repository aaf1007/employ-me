---
status: accepted
---

# The extension reaches Claude and Codex through a local helper that runs your own CLIs

Users should be able to pay for the AI with their existing Claude or ChatGPT/Codex subscription, not an API key. Neither subscription can be used from inside the browser without handling login tokens, and Anthropic forbids that (see [ADR-0002](0002-claude-only-through-the-unmodified-cli.md)). A Manifest V3 extension also cannot start local programs.

So the extension sends its requests over Chrome Native Messaging to a small helper the user installs once. The helper runs the user's own, already-logged-in `claude -p` and `codex app-server`.

## Considered Options

- **Localhost HTTP/WebSocket server.** Rejected: it is an always-running process with an open port, and needs pairing, Origin checks and DNS-rebinding protection.
- **The user's Claude Code or Codex drives the browser through MCP.** Rejected for v1. It is the clearest position under Anthropic's policy, but it is slow, uses a lot of tokens and lives in the terminal. Agents that drive forms themselves also scored poorly on form-filling benchmarks.
- **API keys called directly from the extension.** No install step, but not what users asked for. Deferred; the provider boundary keeps this cheap to add later.
- **OpenAI's Sign in with ChatGPT.** Official for open-source apps, but still a preview as of 2026-10 (no system prompt, structured output undocumented). Revisit once it leaves preview.

## Consequences

- Installing takes one extra step: a command that writes a Native Messaging host manifest for each Chromium browser.
- The extension ID must stay fixed (via the manifest `key`), because each host manifest whitelists that ID.
- Chrome launched from the GUI doesn't inherit the shell's `PATH`, so the installer records absolute paths to `claude` and `codex`.
- Messages from the helper to the extension are capped at 1 MB each.
