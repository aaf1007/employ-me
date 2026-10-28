import { err, helperError, type Provider } from '@employ-me/core/protocol';

/**
 * Codex through the user's own `codex app-server` (JSON-RPC over stdio:
 * `thread/start`, `turn/start` with `outputSchema`, `account/rateLimits/read`).
 * Keep one app-server warm; each cold call costs ~17K tokens of built-in
 * instructions (research §3.2). Default model, low effort for field mapping
 * (design.md "Default models").
 */
export function createCodexProvider(cliPath: string): Provider {
  const notImplemented = () =>
    Promise.resolve(err(helperError('notImplemented', 'Codex provider is not built yet')));
  return {
    id: 'codex',
    isFake: false,
    status: () => Promise.resolve({ id: 'codex', state: 'unknown', path: cliPath }),
    mapFields: notImplemented,
    draftAnswer: notImplemented,
    parseResume: notImplemented,
  };
}
