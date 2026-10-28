import { atsForFormHost, err, ok, type CountryCode, type PostingKey, type Result } from '@employ-me/core';
import { countriesIn } from './countries';
import { isRecord, list, text } from '../json';
import { soleCountry } from './read';
import { workdayApiUrl, workdayCompany, workdayPosting } from './workday';

// Public, unauthenticated job APIs (research §7). fill can't fetch: it only
// builds the request and parses the answer. The extension's allowlisted
// network module (packages/extension/src/net/ats-public-api.ts) does the GET.

export interface PublicApiRequest {
  readonly key: PostingKey;
  /** Always https, always a host in core's ATS_HOSTS publicApi list. */
  readonly url: string;
  readonly method: 'GET';
}

/** The Posting facts a public API gives, for Snapshots and the Posting's country. */
export interface PublicPostingDetails {
  readonly title?: string;
  readonly company?: string;
  readonly location?: string;
  readonly country?: CountryCode;
  readonly description?: string;
  /** Options per form field name, from Greenhouse's `questions=true` (react-select menus render only when open). */
  readonly fieldOptions?: Readonly<Record<string, readonly string[]>>;
}

export type PublicApiParseError = {
  readonly reason: 'unexpectedShape' | 'postingNotFound';
  readonly detail: string;
};

/**
 * The request for a Posting's public API, or null for the generic fallback
 * (it falls back to the page's JSON-LD). Greenhouse
 * `/v1/boards/{board}/jobs/{id}?questions=true&pay_transparency=true`, Lever
 * `/v0/postings/{company}/{id}?mode=json`, Ashby
 * `/posting-api/job-board/{org}?includeCompensation=true`, Workday
 * `/wday/cxs/{tenant}/{site}/job/{path}` on the form's own host (which only
 * `formUrl` names).
 */
export function publicApiRequest(key: PostingKey, formUrl?: URL): PublicApiRequest | null {
  const enc = encodeURIComponent;
  switch (key.ats) {
    case 'greenhouse':
      return request(
        key,
        `https://boards-api.greenhouse.io/v1/boards/${enc(key.employer)}/jobs/${enc(key.jobId)}?questions=true&pay_transparency=true`,
      );
    case 'lever': {
      const host = formUrl?.hostname === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co';
      return request(key, `https://${host}/v0/postings/${enc(key.employer)}/${enc(key.jobId)}?mode=json`);
    }
    case 'ashby':
      return request(
        key,
        `https://api.ashbyhq.com/posting-api/job-board/${enc(key.employer)}?includeCompensation=true`,
      );
    case 'workday': {
      if (formUrl === undefined || atsForFormHost(formUrl.hostname) !== 'workday') return null;
      const posting = workdayPosting(formUrl);
      return posting === null || posting.jobId !== key.jobId
        ? null
        : request(key, workdayApiUrl(formUrl, posting));
    }
    case 'generic':
      return null;
  }
}

function request(key: PostingKey, url: string): PublicApiRequest {
  return { key, url, method: 'GET' };
}

/** Reads a public API's JSON (already fetched and JSON-parsed by the extension) as Posting facts. */
export function parsePublicPosting(
  key: PostingKey,
  json: unknown,
): Result<PublicPostingDetails, PublicApiParseError> {
  if (!isRecord(json)) return err({ reason: 'unexpectedShape', detail: 'response is not an object' });
  switch (key.ats) {
    case 'greenhouse':
      return ok(greenhouse(json));
    case 'lever':
      return ok(lever(json));
    case 'ashby': {
      const job = list(json['jobs'])
        .filter(isRecord)
        .find((j) => text(j['id']) === key.jobId);
      return job === undefined
        ? err({ reason: 'postingNotFound', detail: 'job id not on the board' })
        : ok(ashby(job));
    }
    case 'workday':
      return isRecord(json['jobPostingInfo'])
        ? ok(workday(json['jobPostingInfo'], json['hiringOrganization']))
        : err({ reason: 'postingNotFound', detail: 'no jobPostingInfo in the answer' });
    case 'generic':
      return err({ reason: 'unexpectedShape', detail: 'the generic fallback has no public API' });
  }
}

function greenhouse(job: Record<string, unknown>): PublicPostingDetails {
  const location = isRecord(job['location']) ? text(job['location']['name']) : undefined;
  const fieldOptions = Object.fromEntries(
    [...list(job['questions']), ...complianceQuestions(job)]
      .filter(isRecord)
      .flatMap((question) => list(question['fields']).filter(isRecord))
      .flatMap((field) => {
        const name = text(field['name']);
        const values = list(field['values'])
          .filter(isRecord)
          .map((v) => text(v['label']))
          .filter((v): v is string => v !== undefined);
        return name !== undefined && values.length > 0 ? [[name, values] as const] : [];
      }),
  );
  return compact({
    title: text(job['title']),
    company: text(job['company_name']),
    location,
    country: soleCountry(location),
    // Greenhouse escapes the HTML once more: unescape, strip tags, unescape the text.
    description: decodeEntities(stripHtml(decodeEntities(text(job['content']) ?? ''))),
    fieldOptions,
  });
}

function complianceQuestions(job: Record<string, unknown>): unknown[] {
  return list(job['compliance'])
    .filter(isRecord)
    .flatMap((block) => list(block['questions']));
}

function lever(posting: Record<string, unknown>): PublicPostingDetails {
  const categories = isRecord(posting['categories']) ? posting['categories'] : {};
  const location = text(categories['location']);
  const declared = text(posting['country']);
  return compact({
    title: text(posting['text']),
    location,
    country: declared !== undefined && /^[A-Z]{2}$/.test(declared) ? declared : soleCountry(location),
    description: [text(posting['descriptionPlain']), text(posting['additionalPlain'])]
      .filter(Boolean)
      .join('\n\n'),
  });
}

function ashby(job: Record<string, unknown>): PublicPostingDetails {
  const address =
    isRecord(job['address']) && isRecord(job['address']['postalAddress'])
      ? job['address']['postalAddress']
      : {};
  const location = text(job['location']);
  const countries = countriesIn(text(address['addressCountry']) ?? '');
  return compact({
    title: text(job['title']),
    location,
    country: countries.length === 1 ? countries[0] : soleCountry(location),
    description: text(job['descriptionPlain']),
  });
}

/** CXS `job/…`: `{ jobPostingInfo, hiringOrganization }`. */
function workday(info: Record<string, unknown>, org: unknown): PublicPostingDetails {
  const additional = list(info['additionalLocations'])
    .map(text)
    .filter((l) => l !== undefined);
  const location = [text(info['location']), ...additional].filter(Boolean).join('; ');
  const requisition = isRecord(info['jobRequisitionLocation']) ? info['jobRequisitionLocation'] : {};
  const declared = isRecord(requisition['country']) ? text(requisition['country']['alpha2Code']) : undefined;
  const named = countriesIn(location);
  // Several locations may span countries; the requisition's own country decides only when they name none.
  const country =
    named.length === 1 ? named[0] : named.length === 0 && additional.length === 0 ? declared : undefined;
  return compact({
    title: text(info['title']),
    company: workdayCompany(isRecord(org) ? text(org['name']) : undefined),
    location,
    country,
    description: decodeEntities(stripHtml(text(info['jobDescription']) ?? '')),
  });
}

function compact(details: Record<string, unknown>): PublicPostingDetails {
  const out: { -readonly [K in keyof PublicPostingDetails]: PublicPostingDetails[K] } = {};
  const title = text(details['title']);
  if (title !== undefined) out.title = title;
  const company = text(details['company']);
  if (company !== undefined) out.company = company;
  const location = text(details['location']);
  if (location !== undefined) out.location = location;
  const country = text(details['country']);
  if (country !== undefined && /^[A-Z]{2}$/.test(country)) out.country = country;
  const description = text(details['description']);
  if (description !== undefined) out.description = description;
  const options = details['fieldOptions'];
  if (isRecord(options) && Object.keys(options).length > 0) {
    out.fieldOptions = Object.fromEntries(
      Object.entries(options).map(([name, values]) => [name, list(values).map((v) => text(v) ?? '')]),
    );
  }
  return out;
}

function decodeEntities(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}
