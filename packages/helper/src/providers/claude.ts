import { err, helperError, type Provider } from '@employ-me/core/protocol';

/**
 * Claude through the user's own, unmodified `claude -p` (ADR-0002).
 *
 * When implementing, follow research §3.2 exactly: `--output-format json
 * --json-schema --model sonnet --tools "" --strict-mcp-config
 * --setting-sources "" --disable-slash-commands --no-session-persistence
 * --system-prompt-file`, stdin from /dev/null, read `structured_output`, and
 * delete ANTHROPIC_API_KEY from the child's environment. Never read the
 * Keychain or ~/.claude credentials.
 */
export function createClaudeProvider(cliPath: string): Provider {
  const notImplemented = () =>
    Promise.resolve(err(helperError('notImplemented', 'Claude provider is not built yet')));
  return {
    id: 'claude',
    isFake: false,
    status: () => Promise.resolve({ id: 'claude', state: 'unknown', path: cliPath }),
    mapFields: notImplemented,
    draftAnswer: notImplemented,
    parseResume: notImplemented,
  };
}
