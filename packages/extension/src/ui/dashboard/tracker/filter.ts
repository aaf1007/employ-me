import type { Status } from '@employ-me/core';
import type { ApplicationSummary } from '../../../storage';

export interface TrackerFilter {
  readonly search: string;
  readonly status: Status | 'all';
  /** A company name from `companies()`; null for every company. */
  readonly company: string | null;
}

export const NO_FILTER: TrackerFilter = { search: '', status: 'all', company: null };

/** The company as the Tracker shows it: the Posting's company name, else its employer key. */
export function companyOf(application: ApplicationSummary): string {
  return application.posting.company ?? application.posting.key.employer;
}

export function filterApplications(
  applications: readonly ApplicationSummary[],
  filter: TrackerFilter,
): ApplicationSummary[] {
  const words = filter.search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  return applications.filter((application) => {
    if (filter.status !== 'all' && application.status !== filter.status) return false;
    if (filter.company !== null && companyOf(application) !== filter.company) return false;
    const haystack = [
      companyOf(application),
      application.posting.title ?? '',
      application.posting.location ?? '',
      application.notes,
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function companies(applications: readonly ApplicationSummary[]): string[] {
  return [...new Set(applications.map(companyOf))].sort((a, b) => a.localeCompare(b));
}

export function statusCounts(applications: readonly ApplicationSummary[]): Record<Status, number> {
  const counts: Record<Status, number> = { applied: 0, interviewing: 0, offer: 0, rejected: 0, withdrawn: 0 };
  for (const application of applications) counts[application.status] += 1;
  return counts;
}
