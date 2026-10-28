import type { Posting, ResumeMeta, Snapshot, SubmittedAnswer } from '@employ-me/core';
import type { PublicPostingDetails } from '@employ-me/fill';

/** The page's Posting, completed from its public job API. The API's description wins: it is the full text. */
export function withPublicDetails(posting: Posting, details: PublicPostingDetails | null): Posting {
  if (details === null) return posting;
  const merged: Posting = { ...posting };
  const title = posting.title ?? details.title;
  const company = posting.company ?? details.company;
  const location = posting.location ?? details.location;
  const country = posting.country ?? details.country;
  const description = details.description ?? posting.description;
  return {
    ...merged,
    ...(title === undefined ? {} : { title }),
    ...(company === undefined ? {} : { company }),
    ...(location === undefined ? {} : { location }),
    ...(country === undefined ? {} : { country }),
    ...(description === undefined ? {} : { description }),
  };
}

export interface Submission {
  readonly posting: Posting;
  readonly snapshot: Snapshot;
}

/**
 * What a confirmed submission records: the Posting (its description lives in
 * the Snapshot, so the Tracker list never loads it) and the Snapshot of what
 * you sent (design.md "Tracking").
 */
export function submissionOf(
  posting: Posting,
  answers: readonly SubmittedAnswer[],
  resume: Pick<ResumeMeta, 'id' | 'label' | 'fileName'> | null,
  capturedAt: Date,
): Submission {
  const { description, ...rest } = posting;
  return {
    posting: rest,
    snapshot: {
      capturedAt: capturedAt.toISOString(),
      postingDescription: description ?? '',
      answers: [...answers],
      resume: resume === null ? null : { id: resume.id, label: resume.label, fileName: resume.fileName },
    },
  };
}
