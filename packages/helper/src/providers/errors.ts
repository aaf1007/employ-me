import {
  HELPER_ERROR_FIXES,
  type HelperError,
  type HelperErrorReason,
  type ProviderId,
} from '@employ-me/core/protocol';

const NAME: Readonly<Record<ProviderId, string>> = { claude: 'Claude', codex: 'Codex' };
const OTHER: Readonly<Record<ProviderId, string>> = { claude: 'Codex', codex: 'Claude' };
const LOG_IN: Readonly<Record<ProviderId, string>> = {
  claude: 'run `claude` in a terminal and log in',
  codex: 'run `codex login` in a terminal',
};

/**
 * A HelperError that names the Provider and says exactly what to run, e.g.
 * "Claude isn't logged in" / "To fix it, run `claude` in a terminal and log
 * in, then click Retry." The fix never repeats the message: both are shown.
 * `message` must never carry CLI output or Profile values.
 */
export function providerError(id: ProviderId, reason: HelperErrorReason, message: string): HelperError {
  return { reason, message, fix: providerFix(id, reason) };
}

const FIXES: Partial<Record<HelperErrorReason, (id: ProviderId) => string>> = {
  providerNotFound: (id) =>
    `Install the ${id} CLI and ${LOG_IN[id]} once, then run \`npx employ-me setup\` again so the helper knows where it is.`,
  providerNotLoggedIn: (id) => `To fix it, ${LOG_IN[id]}, then click Retry.`,
  providerRateLimited: (id) =>
    `Your plan's ${NAME[id]} usage limit was reached. Wait for it to reset, or switch to ${OTHER[id]} in Settings.`,
  providerTimeout: (id) => `${NAME[id]} took too long to answer. Click Retry.`,
  providerFailed: (id) =>
    `${NAME[id]} failed. Click Retry; if it keeps failing, run \`npx employ-me doctor\`.`,
};

/** The Provider-specific fix, or core's generic one for reasons that aren't about the CLI. */
export function providerFix(id: ProviderId, reason: HelperErrorReason): string {
  return FIXES[reason]?.(id) ?? HELPER_ERROR_FIXES[reason];
}
