// Workday URLs (research §4, §7). One Posting is
//   {tenant}.wd{N}.myworkdayjobs.com/[{locale}/]{site}/job/[{location}/]{slug}_{jobPostingId}[/apply/…]
//   wd{N}.myworkdaysite.com/[{locale}/]recruiting/{tenant}/{site}/job/…
// and its public CXS API answers GET /wday/cxs/{tenant}/{site}/job/[{location}/]{slug}_{jobPostingId}
// on the same host. Slugs are the title with every other character turned
// into "-", so the first "_" starts the id ("…-Java-_R_1511543-1": R_1511543-1).

export interface WorkdayPosting {
  readonly tenant: string;
  readonly site: string;
  /** The path after /job/ up to and including the Posting's own segment. */
  readonly jobPath: string;
  /**
   * The requisition: the posting id without its copy number, so
   * "R-0000187445-1" and "R-0000187445-2" are one Posting (research §7
   * "De-duplication").
   */
  readonly jobId: string;
}

const LOCALE = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;

export function workdayPosting(url: URL): WorkdayPosting | null {
  const parts = url.pathname.split('/').filter((p) => p !== '');
  let at = 0;
  if (LOCALE.test(parts[at] ?? '')) at++;
  let tenant = url.hostname.split('.')[0];
  if (url.hostname.toLowerCase().endsWith('.myworkdaysite.com')) {
    if (parts[at] !== 'recruiting') return null;
    tenant = parts[at + 1];
    at += 2;
  }
  const site = parts[at];
  const kind = parts[at + 1];
  if (tenant === undefined || site === undefined || (kind !== 'job' && kind !== 'details')) return null;
  const rest = parts.slice(at + 2);
  const own = rest.findIndex((p) => p.includes('_'));
  const segment = rest[own];
  if (segment === undefined) return null;
  const postingId = segment.slice(segment.indexOf('_') + 1);
  const jobId = postingId.replace(/-\d{1,2}$/, '');
  if (jobId === '') return null;
  return { tenant, site, jobPath: rest.slice(0, own + 1).join('/'), jobId };
}

/** The CXS job API URL for the Posting at `url`, on its own host. */
export function workdayApiUrl(url: URL, posting: WorkdayPosting): string {
  return `https://${url.host}/wday/cxs/${posting.tenant}/${posting.site}/job/${posting.jobPath}`;
}

/** The Posting's own page: the apply flow's URL without `/apply/…`. */
export function workdayPostingPage(url: URL): URL {
  const page = new URL(url.href);
  page.pathname = page.pathname.replace(/\/apply(\/.*)?$/, '');
  return page;
}

/** Workday names the legal entity with a code first: "0000050007 Royal Bank of Canada". */
export function workdayCompany(name: string | undefined): string | undefined {
  const company = name?.replace(/^\d+\s+/, '').trim();
  return company === '' ? undefined : company;
}
