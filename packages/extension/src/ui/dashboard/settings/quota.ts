import type { ProviderQuota } from '@employ-me/core';

/** Below this share left, Settings warns that the plan's limit is close. */
export const LOW_QUOTA_PERCENT = 10;

/** "5-hour", "weekly", "2-day": how long a usage window is. */
export function windowName(minutes: number | undefined): string {
  if (minutes === undefined) return 'current';
  if (minutes === 10_080) return 'weekly';
  if (minutes % 1440 === 0) return `${String(minutes / 1440)}-day`;
  if (minutes % 60 === 0) return `${String(minutes / 60)}-hour`;
  return `${String(minutes)}-minute`;
}

/** "72% left of the 5-hour limit, resets Oct 28, 3:40 PM". */
export function quotaText(quota: ProviderQuota, format: (iso: string) => string): string {
  const left = `${String(Math.round(quota.remainingPercent))}% left of the ${windowName(quota.windowMinutes)} limit`;
  return quota.resetsAt === undefined ? left : `${left}, resets ${format(quota.resetsAt)}`;
}
