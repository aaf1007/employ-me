import { z } from 'zod';

// `codex app-server` has no --ignore-user-config, so the user's tools,
// plugins, skills, MCP servers and hooks are switched off one by one with
// `-c` overrides (Codex's equivalent of claude's --tools "" and
// --strict-mcp-config). Postings are untrusted text and every Provider runs
// with tools off (design.md "AI").
//
// `-c features.<name>=false` is used rather than `--disable <name>`: Codex
// rejects an unknown --disable name but ignores an unknown -c key, so this
// list survives Codex versions adding or removing features. Checked against
// `codex features list` on codex-cli 0.158.0.

const FEATURES_OFF = [
  'apps',
  'browser_use',
  'browser_use_external',
  'code_mode_host',
  'computer_use',
  'default_mode_request_user_input',
  'goals',
  'hooks',
  'image_generation',
  'in_app_browser',
  'memories',
  'multi_agent',
  'multi_agent_v2',
  'plugins',
  'realtime_conversation',
  'remote_plugin',
  'shell_snapshot',
  'shell_tool',
  'skill_mcp_dependency_install',
  'skill_search',
  'sleep_tool',
  'standalone_web_search',
  'tool_call_mcp_elicitation',
  'tool_suggest',
  'unified_exec',
  'view_image',
  'workspace_dependencies',
  'worktrees',
];

const CONFIG = [
  'web_search="disabled"',
  'sandbox_mode="read-only"',
  'approval_policy="never"',
  // No skill list, AGENTS.md, environment, permission or app blurbs in the
  // prompt: our system prompt is the whole context.
  'skills.include_instructions=false',
  'project_doc_max_bytes=0',
  'include_environment_context=false',
  'include_permissions_instructions=false',
  'include_apps_instructions=false',
  'history.persistence="none"',
];

/** The `-c` overrides that strip a Codex process down to a plain model call. */
export function isolationArgs(enabledMcpServers: readonly string[]): string[] {
  return [
    ...FEATURES_OFF.map((feature) => `features.${feature}=false`),
    ...CONFIG,
    ...enabledMcpServers.map((name) => `mcp_servers.${name}.enabled=false`),
  ].flatMap((override) => ['-c', override]);
}

const mcpListSchema = z.array(z.object({ name: z.string(), enabled: z.boolean().default(true) }));

/** A name `-c mcp_servers.<name>.enabled=false` can address. Codex's -c parser takes no quoted keys. */
const BARE_KEY = /^[A-Za-z0-9_-]+$/;

export type McpServers =
  { readonly ok: true; readonly enabled: string[] } | { readonly ok: false; readonly name?: string };

/**
 * The enabled MCP servers in `codex mcp list --json` output (run with
 * plugins off, so only the user's config.toml servers are listed). Fails
 * closed: a server we can't switch off means Codex isn't used at all.
 */
export function parseMcpList(stdout: string): McpServers {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { ok: false };
  }
  const parsed = mcpListSchema.safeParse(json);
  if (!parsed.success) return { ok: false };
  const enabled = parsed.data.filter((server) => server.enabled).map((server) => server.name);
  const unaddressable = enabled.find((name) => !BARE_KEY.test(name));
  return unaddressable === undefined ? { ok: true, enabled } : { ok: false, name: unaddressable };
}
