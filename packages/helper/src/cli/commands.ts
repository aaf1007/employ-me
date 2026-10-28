import { parseArgs, type ParseArgsConfig } from 'node:util';
import { err, ok, type Result } from '@employ-me/core/protocol';
import type { HelperPlatform } from '../log/paths';
import type { ProviderEnv } from '../providers/select';

/** Output for CLI commands. Commands never touch console or process.stdout directly. */
export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

/** Where the CLI is running. Tests pass their own. */
export interface CliContext {
  readonly platform: HelperPlatform;
  readonly home: string;
  readonly env: ProviderEnv;
  /** The node running this CLI. The launcher records it: Chrome has no PATH (ADR-0001). */
  readonly nodePath: string;
  /** This build's dist/ folder: host.mjs and its chunks. */
  readonly helperDist: string;
}

export type Command = (args: readonly string[], io: CliIo, context: CliContext) => Promise<number>;

type Options = NonNullable<ParseArgsConfig['options']>;

/** Parses flags strictly; an unknown flag is a usage error, not a crash. */
export function parseFlags<O extends Options>(
  args: readonly string[],
  options: O,
): Result<ReturnType<typeof parseArgs<{ args: string[]; options: O; strict: true }>>['values'], string> {
  try {
    return ok(parseArgs({ args: [...args], options, strict: true }).values);
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Invalid arguments');
  }
}

export const MARK = { ok: '✓', bad: '✗', note: '-' } as const;
