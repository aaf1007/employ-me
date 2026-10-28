import { atsForFormHost, type KnownAtsId, type PostingKey } from '@employ-me/core';
import { postingKeyFromUrl } from '@employ-me/fill';

// The Posting key for an Application you add by hand or import, so the
// already-applied warning still recognizes the Posting later. Known ATS URLs
// give the board slug and job id; anything else is keyed by company and URL.
// The fill engine derives keys for the Postings it fills (fill's
// postingKeyFromUrl); this covers only the hand-added ones.

const PATHS: Readonly<Record<Exclude<KnownAtsId, 'workday'>, RegExp>> = {
  // job-boards.greenhouse.io/{board}/jobs/{id}
  greenhouse: /^\/([^/]+)\/jobs\/(\d+)/,
  // jobs.lever.co/{company}/{uuid}
  lever: /^\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  // jobs.ashbyhq.com/{org}/{uuid}
  ashby: /^\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
};

export function postingKeyFor(url: URL, company: string): PostingKey {
  const ats = atsForFormHost(url.hostname);
  // Workday's tenant is in the host and its id needs parsing: fill keys it, so both always agree.
  const workday = ats === 'workday' ? postingKeyFromUrl(url) : null;
  if (workday !== null) return workday;
  if (ats !== null && ats !== 'workday') {
    const match = PATHS[ats].exec(url.pathname);
    const [, employer, jobId] = match ?? [];
    if (employer !== undefined && jobId !== undefined) {
      return { ats, employer: employer.toLowerCase(), jobId: jobId.toLowerCase() };
    }
  }
  const path = url.pathname.replace(/\/+$/, '');
  return {
    ats: 'generic',
    employer: slug(company) || url.hostname.toLowerCase(),
    jobId: `${url.hostname.toLowerCase()}${path}`.slice(0, 200),
  };
}

export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

/** A posting URL the user typed: absolute http(s), or null. */
export function postingUrl(text: string): URL | null {
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  // URL.canParse needs Chrome 120; the manifest allows 116.
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}
