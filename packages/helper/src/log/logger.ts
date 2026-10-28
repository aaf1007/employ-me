import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HelperErrorReason, HelperRequestType, ProviderId } from '@employ-me/core/protocol';

/**
 * One log line. The shape is closed on purpose: there is no free-form
 * message or payload field, so Profile values, Drafts, Resumes, prompts and
 * job descriptions cannot end up in the log. Log what happened, not what was said.
 */
export interface LogEntry {
  readonly event:
    | 'host.start'
    | 'host.stop'
    | 'request.received'
    | 'request.done'
    | 'request.failed'
    | 'provider.spawn'
    | 'provider.exit';
  readonly requestId?: string;
  readonly type?: HelperRequestType;
  readonly provider?: ProviderId;
  readonly durationMs?: number;
  readonly bytes?: number;
  readonly exitCode?: number;
  readonly reason?: HelperErrorReason;
}

export interface Logger {
  log(entry: LogEntry): void;
}

export const silentLogger: Logger = { log: () => undefined };

/** Rotate past this size, keeping one previous file, so the log never grows without bound. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

/**
 * Appends JSON lines to `file` (see paths.ts), creating its directory.
 * Never writes to stdout: stdout is the Native Messaging channel. If the file
 * can't be written, the logger reports once through `onFailure` (the host
 * passes stderr, which Chrome shows with --enable-logging) and then stops.
 */
export function createFileLogger(file: string, onFailure: (error: unknown) => void): Logger {
  let failed = false;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const size = statSync(file, { throwIfNoEntry: false })?.size ?? 0;
    if (size > MAX_LOG_BYTES) renameSync(file, `${file}.1`);
  } catch (error) {
    failed = true;
    onFailure(error);
  }
  return {
    log(entry) {
      if (failed) return;
      try {
        appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, {
          mode: 0o600,
        });
      } catch (error) {
        failed = true;
        onFailure(error);
      }
    },
  };
}
