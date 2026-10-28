import type { TaskSpec } from '../task';

/** Sonnet for everything (design.md "Default models"). */
export const DEFAULT_CLAUDE_MODEL = 'sonnet';

/**
 * The stock `claude -p` with everything of the user's own turned off
 * (research §3.2, ADR-0002): no tools, no MCP servers, no settings, plugins
 * or hooks, no slash commands or skills, no saved session, and our own
 * system prompt. Without these, the user's setup inflates every call (a
 * trivial call measured ~$0.31 instead of ~$0.0002) and a Posting could
 * reach tools. The prompt itself goes on stdin, not here: argv is visible to
 * other processes and has a size limit.
 */
export function claudeArgs(task: TaskSpec, model: string): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(task.schema),
    '--model',
    model,
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--system-prompt',
    task.system,
  ];
}

/**
 * The user's environment minus ANTHROPIC_API_KEY, so the CLI uses the plan
 * the user logged into rather than an API key (ADR-0002). Nothing is added:
 * the helper never handles Claude credentials.
 */
export function claudeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY: _removed, ...rest } = env;
  return rest;
}
