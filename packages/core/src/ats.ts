import { z } from 'zod';

/** Milestone 1 ATSs plus the generic fallback (design.md "Job sites"). */
export const ATS_IDS = ['greenhouse', 'lever', 'ashby', 'generic'] as const;
export const atsIdSchema = z.enum(ATS_IDS);
export type AtsId = z.infer<typeof atsIdSchema>;
export type KnownAtsId = Exclude<AtsId, 'generic'>;

interface AtsHosts {
  /** Hosts that serve Application Forms. Content scripts run here, in all frames. */
  readonly form: readonly string[];
  /** Public, unauthenticated job APIs used for Snapshots (research §7). */
  readonly publicApi: readonly string[];
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
};

const KNOWN_ATS: readonly KnownAtsId[] = ['greenhouse', 'lever', 'ashby'];

export function formMatchPatterns(): string[] {
  return KNOWN_ATS.flatMap((ats) => ATS_HOSTS[ats].form.map((host) => `https://${host}/*`));
}

export function publicApiMatchPatterns(): string[] {
  return KNOWN_ATS.flatMap((ats) => ATS_HOSTS[ats].publicApi.map((host) => `https://${host}/*`));
}

/** Which known ATS serves forms on this host, if any. */
export function atsForFormHost(hostname: string): KnownAtsId | null {
  return KNOWN_ATS.find((ats) => ATS_HOSTS[ats].form.includes(hostname)) ?? null;
}

export function isPublicApiHost(hostname: string): boolean {
  return KNOWN_ATS.some((ats) => ATS_HOSTS[ats].publicApi.includes(hostname));
}
