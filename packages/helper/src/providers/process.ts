import { spawn } from 'node:child_process';
import type { HelperPlatform } from '../log/paths';
import { spawnCommand } from './spawn-command';

export interface ProcessSpec {
  readonly platform: HelperPlatform;
  readonly command: string;
  readonly args: readonly string[];
  /** Written to stdin, which is then closed so the CLI never waits on it. */
  readonly input?: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export type ProcessOutcome =
  | {
      readonly kind: 'exited';
      readonly exitCode: number | null;
      readonly stdout: string;
      readonly stderr: string;
      readonly durationMs: number;
    }
  | { readonly kind: 'notFound' | 'spawnFailed' | 'timedOut' | 'aborted'; readonly durationMs: number };

/** Grace period between SIGTERM and SIGKILL when a CLI overruns or the request is cancelled. */
const KILL_GRACE_MS = 2000;

/** Runs one CLI process to completion. Never rejects: every way it can end is an outcome. */
export function runProcess(spec: ProcessSpec): Promise<ProcessOutcome> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  if (spec.signal?.aborted === true) return Promise.resolve({ kind: 'aborted', durationMs: 0 });

  return new Promise((resolve) => {
    const command = spawnCommand(spec.platform, spec.command, spec.args);
    const child = spawn(command.file, command.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: command.windowsVerbatimArguments,
    });
    let stdout = '';
    let stderr = '';
    let stopped: 'timedOut' | 'aborted' | null = null;
    let settled = false;

    const stop = (why: 'timedOut' | 'aborted') => {
      if (stopped !== null) return;
      stopped = why;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
    };
    const timer = setTimeout(() => {
      stop('timedOut');
    }, spec.timeoutMs);
    const onAbort = () => {
      stop('aborted');
    };
    spec.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (outcome: ProcessOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      spec.signal?.removeEventListener('abort', onAbort);
      resolve(outcome);
    };

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    // EPIPE here means the CLI exited before reading its input; its exit
    // status, reported on 'close', is what explains the failure.
    child.stdin.on('error', () => undefined);
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({ kind: error.code === 'ENOENT' ? 'notFound' : 'spawnFailed', durationMs: elapsed() });
    });
    child.on('close', (exitCode) => {
      const durationMs = elapsed();
      finish(
        stopped === null
          ? { kind: 'exited', exitCode, stdout, stderr, durationMs }
          : { kind: stopped, durationMs },
      );
    });
    child.stdin.end(spec.input ?? '');
  });
}
