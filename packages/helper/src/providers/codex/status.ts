import type { HelperError, ProviderQuota } from '@employ-me/core/protocol';
import { z } from 'zod';
import { providerError } from '../errors';
import type { AppServer } from './app-server';

const RPC_TIMEOUT_MS = 15_000;

/** Only the account type is read: whether someone is logged in. The email and ids it carries are dropped. */
const accountSchema = z.object({ account: z.object({ type: z.string() }).nullable() });

const windowSchema = z
  .object({
    usedPercent: z.number(),
    windowDurationMins: z.number().nullable(),
    resetsAt: z.number().nullable(),
  })
  .nullable();
const rateLimitsSchema = z.object({
  ordinaryUsageAllowed: z.boolean().nullable().optional(),
  rateLimits: z.object({ primary: windowSchema, secondary: windowSchema }),
});

export type CodexLogin =
  | { readonly state: 'ready'; readonly quota?: ProviderQuota[]; readonly problem?: HelperError }
  | { readonly state: 'notLoggedIn' | 'unknown'; readonly problem: HelperError };

/**
 * Login state from `account/read`, and remaining quota from
 * `account/rateLimits/read` when the account has one (API-key logins don't).
 */
export async function codexLogin(server: AppServer): Promise<CodexLogin> {
  const account = await server.rpc.request('account/read', { refreshToken: false }, RPC_TIMEOUT_MS);
  const parsed = account.ok ? accountSchema.safeParse(account.value) : null;
  if (parsed?.success !== true) {
    return {
      state: 'unknown',
      problem: providerError('codex', 'providerFailed', "Codex didn't report its login"),
    };
  }
  if (parsed.data.account === null) {
    return {
      state: 'notLoggedIn',
      problem: providerError('codex', 'providerNotLoggedIn', "Codex isn't logged in"),
    };
  }
  const limits = await server.rpc.request(
    'account/rateLimits/read',
    { excludeResetCreditDetails: true },
    RPC_TIMEOUT_MS,
  );
  const rate = limits.ok ? rateLimitsSchema.safeParse(limits.value).data : undefined;
  if (rate === undefined) return { state: 'ready' };
  const quota = [rate.rateLimits.primary, rate.rateLimits.secondary].flatMap((window) =>
    window === null ? [] : [toQuota(window)],
  );
  const exhausted =
    rate.ordinaryUsageAllowed === false || quota.some((window) => window.remainingPercent <= 0);
  return exhausted
    ? {
        state: 'ready',
        quota,
        problem: providerError('codex', 'providerRateLimited', "Codex's usage limit was reached"),
      }
    : { state: 'ready', quota };
}

function toQuota(window: NonNullable<z.infer<typeof windowSchema>>): ProviderQuota {
  return {
    remainingPercent: Math.min(100, Math.max(0, 100 - window.usedPercent)),
    ...(window.windowDurationMins !== null && window.windowDurationMins > 0
      ? { windowMinutes: Math.round(window.windowDurationMins) }
      : {}),
    ...(window.resetsAt === null ? {} : { resetsAt: new Date(window.resetsAt * 1000).toISOString() }),
  };
}
