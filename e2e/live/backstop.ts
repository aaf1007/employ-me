// The live harness's last line of defence: whatever the Fill's guards do,
// the browser itself never sends a write to a job site. Every request that
// isn't a GET or HEAD is aborted, on every host.
//
// The one exception: Ashby renders its Application Form from GraphQL
// *queries* sent as POSTs (ApiJobPosting, ApiOrganizationFromHostedJobsPageName,
// ApiAutocompleteGeoLocation), so without them there is no form to test.
// A GraphQL query can't change anything on the server; only a mutation can
// (autosave, upload handles, submit). So a POST to Ashby's GraphQL endpoint
// passes only when its body is exactly one operation that is a `query`, and
// the word `mutation` appears nowhere in it.

export type Verdict = 'allow' | 'readQuery' | 'abort';

const ASHBY_GRAPHQL = { host: 'jobs.ashbyhq.com', path: '/api/non-user-graphql' };

export function backstop(method: string, url: string, body: string | null): Verdict {
  if (method === 'GET' || method === 'HEAD') return 'allow';
  const parsed = new URL(url);
  if (
    method === 'POST' &&
    parsed.protocol === 'https:' &&
    parsed.hostname === ASHBY_GRAPHQL.host &&
    parsed.pathname === ASHBY_GRAPHQL.path &&
    isGraphqlQuery(body)
  ) {
    return 'readQuery';
  }
  return 'abort';
}

function isGraphqlQuery(body: string | null): boolean {
  if (body === null) return false;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return false;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return false;
  const query: unknown = 'query' in json ? json.query : undefined;
  if (typeof query !== 'string') return false;
  if (/\b(mutation|subscription)\b/i.test(body)) return false;
  const document = query.replace(/#[^\n]*/g, '').trim();
  const operations = document.match(/(^|\})\s*(query|mutation|subscription)\b/g) ?? [];
  return /^query\b/.test(document) && operations.length === 1;
}
