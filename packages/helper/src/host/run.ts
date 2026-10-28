/**
 * The Native Messaging host loop. Chrome starts it on `connectNative` with
 * the caller's origin as the first argument and keeps it alive while the
 * port is open. Reads frames from stdin, dispatches each, writes responses to
 * stdout. Exits when stdin closes.
 */
export function runHost(_stdin: NodeJS.ReadableStream, _stdout: NodeJS.WritableStream): Promise<void> {
  throw new Error('not implemented');
}
