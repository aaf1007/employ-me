---
status: accepted
---

# Claude runs only through the user's unmodified `claude` CLI; we never handle Claude credentials

## Anthropic's rules (as of 2026-10)

Anthropic forbids third-party tools from:
- offering Claude.ai login;
- routing requests through users' subscription credentials;
- storing users' tokens.

It explicitly does not stop an end user from running the unmodified Claude Code binary with their own subscription, and usage of `claude -p` counts against that user's plan.

## What we do

We stay on the allowed side of that line:
- No "Log in with Claude" button. Users run `claude` once and log in themselves.
- No reading the Keychain or `~/.claude` credentials, no passing tokens along, and no impersonating Claude Code's request headers.
- The helper runs the stock CLI with the user's own plugins, MCP servers, settings and slash commands disabled. It strips `ANTHROPIC_API_KEY` from the environment so the plan is what gets used.
- The README says plainly that this uses your plan's limits and is meant for personal use.

## Why the Claude provider must stay swappable

This is a tolerated grey zone, not an explicit approval. In 2026 OpenCode removed its Claude subscription login after legal requests from Anthropic. The planned separate billing for `claude -p` usage is paused, not cancelled.

So the Claude provider must be swappable for an Anthropic API key without touching anything else.

## Considered Options

- **Codex only until Anthropic explicitly approves this pattern.** Rejected: Claude users are half the intended audience, and this pattern is the closest fit to Anthropic's stated carve-out.
