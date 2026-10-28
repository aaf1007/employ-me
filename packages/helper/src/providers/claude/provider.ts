import type { HelperPlatform } from '../../log/paths';
import type { Logger } from '../../log/logger';
import { createCliProvider } from '../cli-provider';
import { runProcess } from '../process';
import type { HelperProvider } from '../task';
import { DEFAULT_CLAUDE_MODEL, claudeArgs, claudeEnv } from './args';
import { interpretClaudeRun } from './output';
import { claudeStatus } from './status';

export interface ClaudeProviderOptions {
  readonly platform: HelperPlatform;
  /** Absolute path recorded by setup. */
  readonly cliPath: string;
  /** An empty folder, so no project's CLAUDE.md is picked up. */
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly logger: Logger;
  /** config.json's model; a request's model wins over it. Unset: Sonnet. */
  readonly model?: string;
  /** Overrides each task's own timeout. For tests. */
  readonly timeoutMs?: number;
}

/**
 * Claude through the user's own, unmodified `claude -p` (ADR-0002): one
 * process per request, structured output read from `structured_output`.
 * Swappable for an API-key Provider without touching anything else.
 */
export function createClaudeProvider(options: ClaudeProviderOptions): HelperProvider {
  return createCliProvider('claude', {
    ...(options.model === undefined ? {} : { configuredModel: options.model }),
    status: () => claudeStatus(options),
    async run(task, signal, model) {
      options.logger.log({ event: 'provider.spawn', provider: 'claude', type: task.type });
      const outcome = await runProcess({
        platform: options.platform,
        command: options.cliPath,
        args: claudeArgs(task, model ?? DEFAULT_CLAUDE_MODEL),
        input: task.prompt,
        env: claudeEnv(options.env),
        cwd: options.cwd,
        timeoutMs: options.timeoutMs ?? task.timeoutMs,
        signal,
      });
      options.logger.log({
        event: 'provider.exit',
        provider: 'claude',
        type: task.type,
        durationMs: outcome.durationMs,
        ...(outcome.kind === 'exited' && outcome.exitCode !== null ? { exitCode: outcome.exitCode } : {}),
      });
      return interpretClaudeRun(outcome);
    },
  });
}
