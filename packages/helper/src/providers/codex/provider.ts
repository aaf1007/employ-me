import { ok, type HelperError, type ProviderStatus, type Result } from '@employ-me/core/protocol';
import type { Logger } from '../../log/logger';
import type { HelperPlatform } from '../../log/paths';
import { createCliProvider } from '../cli-provider';
import { runProcess } from '../process';
import type { HelperProvider } from '../task';
import { startAppServer, type AppServer } from './app-server';
import { codexLogin } from './status';
import { runCodexTurn } from './turn';

export interface CodexProviderOptions {
  readonly platform: HelperPlatform;
  /** Absolute path recorded by setup. */
  readonly cliPath: string;
  /** An empty folder, so no project's AGENTS.md is picked up. */
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly logger: Logger;
  /** config.json's model; a request's model wins over it. Unset: the account's default in Codex's catalog. */
  readonly model?: string;
  /** Overrides each task's own timeout. For tests. */
  readonly timeoutMs?: number;
}

/**
 * Codex through the user's own `codex app-server` (JSON-RPC over stdio),
 * started on first use and kept warm for the host's lifetime. Each task runs
 * as an ephemeral thread with `outputSchema` set on its turn.
 */
export function createCodexProvider(options: CodexProviderOptions): HelperProvider {
  const env = codexEnv(options.env);
  let running: AppServer | null = null;
  let starting: Promise<Result<AppServer, HelperError>> | null = null;

  // A failed start is retried on the next request, and so is a server that died.
  const connect = (): Promise<Result<AppServer, HelperError>> => {
    if (running !== null && !running.rpc.isClosed()) return Promise.resolve(ok(running));
    starting ??= startAppServer({ ...options, env }).then((started) => {
      starting = null;
      running = started.ok ? started.value : null;
      return started;
    });
    return starting;
  };

  return createCliProvider('codex', {
    ...(options.model === undefined ? {} : { configuredModel: options.model }),
    async status(): Promise<ProviderStatus> {
      const base = { id: 'codex' as const, path: options.cliPath };
      const version = await runProcess({
        platform: options.platform,
        command: options.cliPath,
        args: ['--version'],
        env,
        cwd: options.cwd,
        timeoutMs: 15_000,
      });
      const withVersion = version.kind === 'exited' ? { ...base, ...versionOf(version.stdout) } : base;
      const started = await connect();
      if (!started.ok) {
        const state = started.error.reason === 'providerNotFound' ? 'notFound' : 'unknown';
        return { ...withVersion, state, problem: started.error };
      }
      return { ...withVersion, ...(await codexLogin(started.value)) };
    },
    async run(task, signal, requested) {
      const started = await connect();
      if (!started.ok) return started;
      const timed = options.timeoutMs === undefined ? task : { ...task, timeoutMs: options.timeoutMs };
      const model = chooseModel(started.value, requested, options.logger);
      return runCodexTurn(started.value, timed, { cwd: options.cwd, model }, signal);
    },
    async close() {
      await starting;
      const server = running;
      running = null;
      if (server !== null) {
        server.stop();
        await server.exited;
      }
    },
  });
}

/**
 * The model for a turn: the one asked for if the account's catalog offers
 * it, else the account's default. A name the plan can't use would end as
 * "model_not_found", and the AI never blocks a Fill (design.md "AI"), so the
 * fallback is logged, not an error.
 */
function chooseModel(server: AppServer, requested: string | null, logger: Logger): string | null {
  if (requested === null) return server.defaultModel;
  if (server.models.includes(requested)) return requested;
  logger.log({ event: 'provider.modelFallback', provider: 'codex' });
  return server.defaultModel;
}

function versionOf(stdout: string): { version?: string } {
  const version = /\d+\.\d+\.\d+\S*/.exec(stdout)?.[0];
  return version === undefined ? {} : { version };
}

/**
 * The user's environment minus OpenAI API keys, so Codex uses the ChatGPT
 * login the user made with `codex login`, as Claude uses the plan (ADR-0002).
 */
export function codexEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { OPENAI_API_KEY: _openai, CODEX_API_KEY: _codex, ...rest } = env;
  return rest;
}
