import { atsForFormHost, type PostingKey } from '@employ-me/core';
import { workdayPosting } from './workday';

// Posting identity from URLs (research §7 "De-duplication"): key on
// (ats, board, jobId), with tracking parameters stripped.

const TRACKING =
  /^(utm_.*|gh_src|t|source|src|ref|referrer|referer|lever-source.*|lever-origin|lever-via|gclid|fbclid|msclkid|mc_cid|mc_eid|_hs.*|trk|trackingid|ashby_jid|ashby_source)$/i;

/** `(ats, board, jobId)` from a form or job URL, or null if it isn't one we know. */
export function postingKeyFromUrl(url: URL): PostingKey | null {
  const ats = atsForFormHost(url.hostname);
  const parts = url.pathname.split('/').filter((p) => p !== '');
  switch (ats) {
    case 'greenhouse': {
      // job-boards.greenhouse.io/embed/job_app?for=acme&token=123
      if (parts[0] === 'embed') {
        const board = url.searchParams.get('for');
        const jobId = url.searchParams.get('token') ?? url.searchParams.get('gh_jid');
        return board !== null && jobId !== null ? key('greenhouse', board, jobId) : null;
      }
      // job-boards.greenhouse.io/acme/jobs/123
      const [board, jobs, jobId] = parts;
      return board !== undefined && jobs === 'jobs' && jobId !== undefined && /^\d+$/.test(jobId)
        ? key('greenhouse', board, jobId)
        : null;
    }
    case 'lever': {
      const [company, jobId] = parts;
      return company !== undefined && jobId !== undefined && isUuid(jobId)
        ? key('lever', company, jobId)
        : null;
    }
    case 'ashby': {
      const [org, jobId] = parts;
      return org !== undefined && jobId !== undefined && isUuid(jobId) ? key('ashby', org, jobId) : null;
    }
    case 'workday': {
      // Keyed on the tenant and the requisition, not the site or the copy number (research §7).
      const posting = workdayPosting(url);
      return posting === null ? null : key('workday', posting.tenant, posting.jobId);
    }
    case null:
      return null;
  }
}

/** The apply step at the end of a job page's path. */
const APPLY_STEP = /\/(apply|apply-now|applynow|application|submit)$/i;
/** Query parameters that say how a page is shown, or who is looking, not which job it is. */
const NOT_THE_JOB =
  /^(lang|locale|language|hl|step|page|tab|view|mode|embed|theme|sid|session.*|.*token|auth.*|code|e?mail|_.*)$/i;

/**
 * A Posting on a company's own site, which has no public job API to name it.
 * Greenhouse embeds say which job they show with `?gh_jid=`. Other sites are
 * keyed by host, path and the query parameters that pick the job, so the job
 * page and its apply step (`/jobs/42` and `/jobs/42/apply`), and each step of
 * one form, give the same key, and `?jobId=1` and `?jobId=2` don't.
 */
export function genericPostingKey(url: URL): PostingKey {
  const canonical = canonicalPostingUrl(url);
  const host = canonical.hostname.replace(/^www\./, '');
  const ghJid = canonical.searchParams.get('gh_jid');
  if (ghJid !== null) return key('generic', host, ghJid);
  const path = canonical.pathname.replace(/\/+$/, '').replace(APPLY_STEP, '') || '/';
  const query = [...canonical.searchParams]
    .filter(([name]) => !NOT_THE_JOB.test(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  return key('generic', host, query === '' ? path : `${path}?${query}`);
}

/** Removes utm_* and other tracking parameters, and the fragment (research §7 "De-duplication"). */
export function canonicalPostingUrl(url: URL): URL {
  const out = new URL(url.href);
  out.hash = '';
  for (const name of [...out.searchParams.keys()]) {
    if (TRACKING.test(name)) out.searchParams.delete(name);
  }
  return out;
}

function key(ats: PostingKey['ats'], employer: string, jobId: string): PostingKey {
  return { ats, employer: employer.toLowerCase().slice(0, 200), jobId: jobId.slice(0, 200) };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
