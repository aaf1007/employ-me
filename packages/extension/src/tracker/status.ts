import { STATUSES, type Status } from '@employ-me/core';

/** The glossary's words for each Status. */
export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

/** "Interviewing", "interviewing", " OFFER " → the Status. Null when it isn't one. */
export function statusFrom(text: string): Status | null {
  const wanted = text.trim().toLowerCase();
  return (
    STATUSES.find((status) => status === wanted || STATUS_LABELS[status].toLowerCase() === wanted) ?? null
  );
}
