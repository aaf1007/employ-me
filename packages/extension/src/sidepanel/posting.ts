import {
  atsForFormHost,
  type Posting,
  type ResumeMeta,
  type Snapshot,
  type SubmittedAnswer,
} from '@employ-me/core';
import {
  applicationFormUrl,
  canonicalPostingUrl,
  genericPostingKey,
  type PublicPostingDetails,
} from '@employ-me/fill';

/**
 * The Posting a company site's address names, before anything reads the
 * page: enough for the already-applied warning (design.md "Tracking"). The
 * Fill keys it the same way (fill's genericPostingKey). Null for a known job
 * site's host, whose content script reads the Posting itself.
 */
export function companySitePosting(href: string): Posting | null {
  if (!/^https?:\/\//.test(href)) return null;
  const url = new URL(href);
  if (atsForFormHost(url.hostname) !== null) return null;
  return { key: genericPostingKey(url), url: canonicalPostingUrl(url).href };
}

/** The Application Form's address when the tab shows a Posting whose form is elsewhere (fill's applicationFormUrl). */
export function formElsewhere(href: string | null): string | null {
  if (href === null || !/^https?:\/\//.test(href)) return null;
  return applicationFormUrl(new URL(href))?.href ?? null;
}

/** A company site's own text is the Snapshot's description when nothing better has one. */
export function withPageText(posting: Posting, pageText: string | undefined): Posting {
  return posting.description === undefined && pageText !== undefined
    ? { ...posting, description: pageText }
    : posting;
}

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
