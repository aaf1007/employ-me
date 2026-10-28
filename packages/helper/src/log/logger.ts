import type { HelperErrorReason, HelperRequestType, ProviderId } from '@employ-me/core/protocol';

/**
 * One log line. The shape is closed on purpose: there is no free-form
 * message or payload field, so Profile values, Drafts, Resumes and job
 * descriptions cannot end up in the log. Log what happened, not what was said.
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

/**
 * Appends JSON lines to `file` (see paths.ts), creating its directory.
 * Must never write to stdout: stdout is the Native Messaging channel.
 */
export function createFileLogger(_file: string): Logger {
  throw new Error('not implemented');
}
