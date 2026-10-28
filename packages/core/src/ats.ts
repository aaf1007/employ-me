import { z } from 'zod';

/** Milestone 1 and 2 ATSs plus the generic fallback (design.md "Job sites"). */
export const ATS_IDS = ['greenhouse', 'lever', 'ashby', 'workday', 'generic'] as const;
export const atsIdSchema = z.enum(ATS_IDS);
export type AtsId = z.infer<typeof atsIdSchema>;
export type KnownAtsId = Exclude<AtsId, 'generic'>;

interface AtsHosts {
  /**
   * Hosts that serve Application Forms. Content scripts run here, in all
   * frames. `*.example.com` stands for every subdomain, as in match patterns.
   */
  readonly form: readonly string[];
  /** Public, unauthenticated job APIs used for Snapshots (research §7). */
  readonly publicApi: readonly string[];
  /** The API's path prefix, when it shares its hosts with the forms (Workday's CXS). */
  readonly publicApiPath?: string;
}

/**
 * The single source of truth for which hosts the extension touches. The
 * manifest's host_permissions and content-script matches, and the network
 * allowlist, are all derived from this table. LinkedIn and Indeed must never
 * appear here (design.md "Job sites").
 */
export const ATS_HOSTS: Readonly<Record<KnownAtsId, AtsHosts>> = {
  greenhouse: {
    form: [
      'job-boards.greenhouse.io',
      'job-boards.eu.greenhouse.io',
      'boards.greenhouse.io',
      'boards.eu.greenhouse.io',
    ],
    publicApi: ['boards-api.greenhouse.io'],
  },
  lever: {
    form: ['jobs.lever.co', 'jobs.eu.lever.co'],
    publicApi: ['api.lever.co', 'api.eu.lever.co'],
  },
  ashby: {
    form: ['jobs.ashbyhq.com'],
    publicApi: ['api.ashbyhq.com'],
  },
  // {tenant}.wd{N}.myworkdayjobs.com, and wd{N}.myworkdaysite.com/recruiting/{tenant}
  // (research §4). The CXS job API lives on the same hosts, under /wday/cxs/ (research §7).
  workday: {
    form: ['*.myworkdayjobs.com', '*.myworkdaysite.com'],
    publicApi: ['*.myworkdayjobs.com', '*.myworkdaysite.com'],
    publicApiPath: '/wday/cxs/',
  },
};

const KNOWN_ATS: readonly KnownAtsId[] = ['greenhouse', 'lever', 'ashby', 'workday'];

export function formMatchPatterns(): string[] {
  return KNOWN_ATS.flatMap((ats) => ATS_HOSTS[ats].form.map((host) => `https://${host}/*`));
}

export function publicApiMatchPatterns(): string[] {
  return KNOWN_ATS.flatMap((ats) => {
    const { publicApi, publicApiPath = '/' } = ATS_HOSTS[ats];
    return publicApi.map((host) => `https://${host}${publicApiPath}*`);
  });
}

/** Which known ATS serves forms on this host, if any. */
export function atsForFormHost(hostname: string): KnownAtsId | null {
  return KNOWN_ATS.find((ats) => ATS_HOSTS[ats].form.some((host) => hostMatches(hostname, host))) ?? null;
}

export function isPublicApiHost(hostname: string): boolean {
  return KNOWN_ATS.some((ats) => ATS_HOSTS[ats].publicApi.some((host) => hostMatches(hostname, host)));
}

/** True for an https URL on a public job API host, under that API's path. */
export function isPublicApiUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  return KNOWN_ATS.some((ats) => {
    const { publicApi, publicApiPath = '/' } = ATS_HOSTS[ats];
    return (
      publicApi.some((host) => hostMatches(url.hostname, host)) && url.pathname.startsWith(publicApiPath)
    );
  });
}

/** `*.example.com` matches every subdomain of example.com (not example.com itself); anything else matches exactly. */
function hostMatches(hostname: string, host: string): boolean {
  const name = hostname.toLowerCase();
  return host.startsWith('*.') ? name.endsWith(host.slice(1)) : name === host;
}
