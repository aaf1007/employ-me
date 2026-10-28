import type { ProviderStatus } from '@employ-me/core/protocol';
import { z } from 'zod';
import type { HelperPlatform } from '../../log/paths';
import { providerError } from '../errors';
import { runProcess, type ProcessOutcome } from '../process';
import { claudeEnv } from './args';

const STATUS_TIMEOUT_MS = 15_000;

/** Only `loggedIn` is read from `claude auth status --json`; the account details it prints are dropped unread. */
const authStatusSchema = z.object({ loggedIn: z.boolean() });

export interface ClaudeStatusOptions {
  readonly platform: HelperPlatform;
  readonly cliPath: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
}

/**
 * Whether Claude is ready, asked of the CLI itself: `claude --version` and
 * `claude auth status`. The helper never looks at credentials (ADR-0002).
 */
export async function claudeStatus(options: ClaudeStatusOptions): Promise<ProviderStatus> {
  const run = (args: string[]) =>
    runProcess({
      platform: options.platform,
      command: options.cliPath,
      args,
      env: claudeEnv(options.env),
      cwd: options.cwd,
      timeoutMs: STATUS_TIMEOUT_MS,
    });
  const [version, auth] = await Promise.all([run(['--version']), run(['auth', 'status', '--json'])]);
  const base = { id: 'claude' as const, path: options.cliPath };
  if (version.kind === 'notFound') {
    return {
      ...base,
      state: 'notFound',
      problem: providerError('claude', 'providerNotFound', 'The claude CLI is not where setup found it'),
    };
  }
  const versionText = version.kind === 'exited' ? /\d+\.\d+\.\d+\S*/.exec(version.stdout)?.[0] : undefined;
  const withVersion = versionText === undefined ? base : { ...base, version: versionText };
  const loggedIn = parseLoggedIn(auth);
  if (loggedIn === null) return { ...withVersion, state: 'unknown' };
  return loggedIn
    ? { ...withVersion, state: 'ready' }
    : {
        ...withVersion,
        state: 'notLoggedIn',
        problem: providerError('claude', 'providerNotLoggedIn', "Claude isn't logged in"),
      };
}

function parseLoggedIn(outcome: ProcessOutcome): boolean | null {
  if (outcome.kind !== 'exited') return null;
  try {
    const parsed = authStatusSchema.safeParse(JSON.parse(outcome.stdout));
    return parsed.success ? parsed.data.loggedIn : null;
  } catch {
    return null;
  }
}
