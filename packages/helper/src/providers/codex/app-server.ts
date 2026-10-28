import { spawn } from 'node:child_process';
import { err, ok, type HelperError, type Result } from '@employ-me/core/protocol';
import { z } from 'zod';
import type { Logger } from '../../log/logger';
import type { HelperPlatform } from '../../log/paths';
import { HELPER_VERSION } from '../../version';
import { providerError } from '../errors';
import { runProcess } from '../process';
import { spawnCommand } from '../spawn-command';
import { isolationArgs, parseMcpList } from './isolation';
import { createRpcClient, type RpcClient } from './rpc';

const STARTUP_TIMEOUT_MS = 30_000;

export interface AppServerOptions {
  readonly platform: HelperPlatform;
  readonly cliPath: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly logger: Logger;
}

export interface AppServer {
  readonly rpc: RpcClient;
  /** Resolves when the process exits, for whatever reason. */
  readonly exited: Promise<void>;
  /** The account's default model from `model/list`, or null if unknown. */
  readonly defaultModel: string | null;
  /** Every model `model/list` offers this account. Empty if the catalog couldn't be read. */
  readonly models: readonly string[];
  stop(): void;
}

/**
 * Starts one warm `codex app-server` with the user's own login and
 * everything else of theirs switched off (isolation.ts). Kept for the
 * host's lifetime: a cold start per call costs seconds (research §3.2).
 */
export async function startAppServer(options: AppServerOptions): Promise<Result<AppServer, HelperError>> {
  const mcp = await enabledMcpServers(options);
  if (!mcp.ok) return mcp;

  const command = spawnCommand(options.platform, options.cliPath, [
    'app-server',
    ...isolationArgs(mcp.value),
  ]);
  const child = spawn(command.file, command.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
    windowsVerbatimArguments: command.windowsVerbatimArguments,
  });
  options.logger.log({ event: 'provider.spawn', provider: 'codex' });
  const spawned = new Promise<'started' | 'notFound' | 'failed'>((resolve) => {
    child.once('spawn', () => {
      resolve('started');
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.code === 'ENOENT' ? 'notFound' : 'failed');
    });
  });
  const exited = new Promise<void>((resolve) => {
    child.once('close', (exitCode) => {
      options.logger.log({
        event: 'provider.exit',
        provider: 'codex',
        ...(exitCode === null ? {} : { exitCode }),
      });
      resolve();
    });
  });
  const stop = () => {
    child.stdin.end();
    child.kill('SIGTERM');
  };

  const how = await spawned;
  if (how === 'notFound') {
    return err(providerError('codex', 'providerNotFound', 'The codex CLI is not where setup found it'));
  }
  if (how === 'failed')
    return err(providerError('codex', 'providerFailed', "The codex CLI couldn't be started"));

  // The stdin pipe errors with EPIPE if Codex exits; `exited` reports that.
  child.stdin.on('error', () => undefined);
  const rpc = createRpcClient(child.stdout, child.stdin);
  const init = await rpc.request(
    'initialize',
    { clientInfo: { name: 'employ-me', title: 'employ-me', version: HELPER_VERSION }, capabilities: null },
    STARTUP_TIMEOUT_MS,
  );
  if (!init.ok) {
    stop();
    return err(providerError('codex', 'providerFailed', "codex app-server didn't start"));
  }
  rpc.notify('initialized');
  return ok({ rpc, exited, stop, ...(await accountModels(rpc)) });
}

const modelListSchema = z.object({ data: z.array(z.object({ model: z.string(), isDefault: z.boolean() })) });

/**
 * The models Codex's catalog offers this account, and the one it marks
 * default. The model in the user's config.toml may be one their plan can't
 * use with a ChatGPT login (seen: "model_not_found"), and design.md asks
 * for "the default model". With no catalog, the default is null and Codex
 * picks.
 */
async function accountModels(rpc: RpcClient): Promise<Pick<AppServer, 'defaultModel' | 'models'>> {
  const listed = await rpc.request('model/list', {}, STARTUP_TIMEOUT_MS);
  const entries = (listed.ok ? modelListSchema.safeParse(listed.value).data?.data : undefined) ?? [];
  return {
    defaultModel: entries.find((entry) => entry.isDefault)?.model ?? null,
    models: entries.map((entry) => entry.model),
  };
}

/** Names of the user's enabled MCP servers, to switch off. Fails closed. */
async function enabledMcpServers(options: AppServerOptions): Promise<Result<string[], HelperError>> {
  const outcome = await runProcess({
    platform: options.platform,
    command: options.cliPath,
    args: [...isolationArgs([]), 'mcp', 'list', '--json'],
    env: options.env,
    cwd: options.cwd,
    timeoutMs: STARTUP_TIMEOUT_MS,
  });
  if (outcome.kind === 'notFound') {
    return err(providerError('codex', 'providerNotFound', 'The codex CLI is not where setup found it'));
  }
  if (outcome.kind !== 'exited' || outcome.exitCode !== 0) {
    return err(
      providerError(
        'codex',
        'providerFailed',
        "`codex mcp list` failed, so employ-me can't switch your MCP servers off",
      ),
    );
  }
  const servers = parseMcpList(outcome.stdout);
  if (servers.ok) return ok(servers.enabled);
  return err({
    reason: 'providerFailed',
    message: "employ-me couldn't switch off one of your Codex MCP servers, so it won't run Codex with it",
    fix: `Rename the MCP server${servers.name === undefined ? '' : ` "${servers.name}"`} in ~/.codex/config.toml to letters, digits, - and _ only, or set enabled = false on it, then click Retry.`,
  });
}
