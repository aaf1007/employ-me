import type { ProviderQuota, ProviderStatus } from '@employ-me/core/protocol';
import { MARK } from './commands';

const STATE: Readonly<Record<ProviderStatus['state'], string>> = {
  ready: 'ready',
  notFound: 'not found',
  notLoggedIn: 'not logged in',
  unknown: "couldn't check",
};

/** How `setup` and `doctor` show one Provider. */
export function providerLines(status: ProviderStatus): string[] {
  const healthy = status.state === 'ready' && status.problem === undefined;
  const version = status.version === undefined ? '' : ` ${status.version}`;
  const where = status.path === undefined ? '' : ` (${status.path})`;
  const lines = [`  ${healthy ? MARK.ok : MARK.bad} ${status.id}${version}${where}: ${STATE[status.state]}`];
  if (status.quota !== undefined && status.quota.length > 0) {
    lines.push(`      usage left: ${status.quota.map(quotaText).join(', ')}`);
  }
  if (status.problem !== undefined) lines.push(`      ${status.problem.message}. ${status.problem.fix}`);
  return lines;
}

function quotaText(quota: ProviderQuota): string {
  const window =
    quota.windowMinutes === 300
      ? '5-hour window'
      : quota.windowMinutes === 10_080
        ? 'weekly window'
        : quota.windowMinutes === undefined
          ? 'current window'
          : `${quota.windowMinutes}-minute window`;
  const resets = quota.resetsAt === undefined ? '' : `, resets ${new Date(quota.resetsAt).toLocaleString()}`;
  return `${Math.round(quota.remainingPercent)}% of the ${window}${resets}`;
}
