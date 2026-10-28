import { z } from 'zod';

/**
 * Every error that can reach the side panel from the helper path. Each one
 * carries a reason (for code), a message (what happened) and a fix (what the
 * user can do). The AI never blocks a Fill: these surface as "Couldn't fill"
 * with the fix shown (design.md "AI").
 */
export const HELPER_ERROR_REASONS = [
  // Raised by the extension's transport, before the helper is reached.
  'helperNotInstalled',
  'helperDisconnected',
  // Raised by the helper.
  'protocolMismatch',
  'invalidRequest',
  'messageTooLarge',
  'boundaryViolation',
  'providerNotFound',
  'providerNotLoggedIn',
  'providerRateLimited',
  'providerTimeout',
  'providerFailed',
  'invalidProviderOutput',
  'notImplemented',
  'internal',
] as const;
export const helperErrorReasonSchema = z.enum(HELPER_ERROR_REASONS);
export type HelperErrorReason = z.infer<typeof helperErrorReasonSchema>;

export const helperErrorSchema = z.object({
  reason: helperErrorReasonSchema,
  /** What happened. Must not contain Profile values. */
  message: z.string(),
  /** What the user can do about it. */
  fix: z.string().min(1),
});
export type HelperError = z.infer<typeof helperErrorSchema>;

export const HELPER_ERROR_FIXES: Readonly<Record<HelperErrorReason, string>> = {
  helperNotInstalled: 'Run `npx employ-me setup` in a terminal, then click Retry.',
  helperDisconnected: 'Click Retry. If it keeps happening, run `npx employ-me doctor`.',
  protocolMismatch: 'The helper and the extension are different versions. Run `npx employ-me@latest setup`.',
  invalidRequest: 'This is a bug in employ-me. Copy the debug report and open an issue.',
  messageTooLarge: 'The request was too large. Try a smaller Resume file.',
  boundaryViolation:
    'employ-me refused to send personal data to the AI. This is a bug: copy the debug report and open an issue.',
  providerNotFound:
    'Install the CLI and log in once by running it in a terminal, then run `npx employ-me setup` again.',
  providerNotLoggedIn: 'Open a terminal, run the CLI once and log in, then click Retry.',
  providerRateLimited:
    "Your plan's usage limit was reached. Wait for it to reset, or switch Provider in Settings.",
  providerTimeout: 'The AI took too long to answer. Click Retry.',
  providerFailed: 'The AI CLI exited with an error. Run `npx employ-me doctor` for details.',
  invalidProviderOutput: "The AI's answer wasn't usable. Click Retry.",
  notImplemented: "This isn't built yet.",
  internal: 'Something went wrong in the helper. Run `npx employ-me doctor`; it prints where the log is.',
};

export function helperError(reason: HelperErrorReason, message: string): HelperError {
  return { reason, message, fix: HELPER_ERROR_FIXES[reason] };
}
