import type { HarContent, HarEntry } from './har.ts';

// Scrubbing rules for recorded fixtures (CODING_STANDARDS.md "Adapters":
// scrub anything personal before committing). A recording is made in a fresh
// browser profile, so it holds no account data; what it can hold is session
// cookies, client keys and signed upload policies. Those go, consistently, so
// the scrubbed HAR still replays.

/** Response headers worth replaying. Others (set-cookie, CSP, request ids, lengths of bodies we edit) go. */
const KEPT_RESPONSE_HEADERS = new Set([
  'content-type',
  'location',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-expose-headers',
]);

/** Query parameters that carry a key or token. `token` alone is Greenhouse's job id, so it stays. */
const SECRET_PARAMS = /^(validityToken|api_key|apiKey|access_token|sessionToken|key|k|sitekey)$/;
/** window.ENV-style config entries that hold client keys. */
const SECRET_CONFIG = /"([A-Z0-9_]*(?:KEY|TOKEN|SECRET|CLIENT_ID|APP_ID|DSN)[A-Z0-9_]*)"\s*:\s*"([^"]{6,})"/g;
/** JSON keys of signed upload policies and CSRF tokens. */
const SECRET_JSON_KEY = /signature|credential|policy|security[-_]?token|x-amz-|awsaccesskeyid|csrf|authenticity/i;
const HIDDEN_TOKEN_INPUT = /name="[^"]*(?:csrf|token|authenticity)[^"]*"[^>]*value="([^"]{6,})"/gi;

const MEDIA = /^(image|font|video|audio)\//;
/** Requests that only report, track or challenge. Never kept, whatever the host. */
const NOISE_PATH = /^\/(cdn-cgi|_vercel|api\/v1\/rum|rum|log|track|collect|beacon)\b/;
/** Ashby reads its form through GraphQL POSTs; only read operations are kept. */
const READ_OPERATION = /^Api(JobPosting|Organization|AutocompleteGeoLocation|JobBoard)/;

export interface ScrubOptions {
  readonly hosts: readonly string[];
}

/** True for the entries a fixture keeps: GETs (and Ashby read queries) to the fixture's own hosts, no media. */
export function keepEntry(entry: HarEntry, options: ScrubOptions): boolean {
  const url = new URL(entry.request.url);
  if (!options.hosts.includes(url.hostname)) return false;
  if (NOISE_PATH.test(url.pathname)) return false;
  if (entry.response.status <= 0) return false;
  if (MEDIA.test(entry.response.content.mimeType ?? '')) return false;
  if (entry.request.method === 'GET') return true;
  const operation = url.searchParams.get('op');
  return entry.request.method === 'POST' && operation !== null && READ_OPERATION.test(operation);
}

/** Every key, token or signature found anywhere in the recording, longest first. */
export function collectSecrets(entries: readonly HarEntry[], extraText: readonly string[]): string[] {
  const secrets = new Set<string>();
  const fromText = (text: string) => {
    for (const match of text.matchAll(SECRET_CONFIG)) if (match[2] !== undefined) secrets.add(match[2]);
    for (const match of text.matchAll(HIDDEN_TOKEN_INPUT)) if (match[1] !== undefined) secrets.add(match[1]);
  };
  for (const entry of entries) {
    for (const [name, value] of new URL(entry.request.url).searchParams) {
      if (SECRET_PARAMS.test(name) && value.length >= 6) secrets.add(value);
    }
    const text = textOf(entry.response.content);
    if (text !== null) fromText(text);
  }
  for (const text of extraText) fromText(text);
  return [...secrets].sort((a, b) => b.length - a.length);
}

export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  secrets.forEach((secret, i) => {
    out = out.split(secret).join(`REDACTED${i}`);
    // The same value URL-encoded, as it appears in query strings.
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) out = out.split(encoded).join(`REDACTED${i}`);
  });
  return out;
}

/** A scrubbed copy of one entry, with secrets replaced and nothing session-specific left. */
export function scrubEntry(entry: HarEntry, secrets: readonly string[]): HarEntry {
  const url = redact(entry.request.url, secrets);
  const content = entry.response.content;
  const text = textOf(content);
  const scrubbedText = text === null ? null : scrubBody(redact(text, secrets), content.mimeType ?? '');
  return {
    startedDateTime: entry.startedDateTime,
    time: entry.time,
    request: {
      method: entry.request.method,
      url,
      httpVersion: entry.request.httpVersion,
      headers: [],
      queryString: [...new URL(url).searchParams].map(([name, value]) => ({ name, value })),
      cookies: [],
      headersSize: -1,
      bodySize: entry.request.bodySize,
      ...(entry.request.postData === undefined
        ? {}
        : {
            postData: {
              mimeType: entry.request.postData.mimeType,
              text: redact(entry.request.postData.text ?? '', secrets),
            },
          }),
    },
    response: {
      status: entry.response.status,
      statusText: entry.response.statusText,
      httpVersion: entry.response.httpVersion,
      headers: entry.response.headers
        .filter((h) => KEPT_RESPONSE_HEADERS.has(h.name.toLowerCase()))
        .map((h) => ({ name: h.name, value: redact(h.value, secrets) })),
      cookies: [],
      content:
        scrubbedText === null
          ? content
          : { size: Buffer.byteLength(scrubbedText), mimeType: content.mimeType ?? '', text: scrubbedText },
      redirectURL: redact(entry.response.redirectURL, secrets),
      headersSize: -1,
      bodySize: -1,
    },
    cache: {},
    timings: entry.timings,
    ...(entry.pageref === undefined ? {} : { pageref: entry.pageref }),
  };
}

function scrubBody(text: string, mimeType: string): string {
  if (!mimeType.includes('json')) return text;
  try {
    return JSON.stringify(redactJson(JSON.parse(text)));
  } catch (error) {
    // Not JSON after all (some APIs mislabel); keep the redacted text.
    if (error instanceof SyntaxError) return text;
    throw error;
  }
}

function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        SECRET_JSON_KEY.test(key) && typeof inner === 'string' ? 'redacted' : redactJson(inner),
      ]),
    );
  }
  return value;
}

/** A body as text, or null for binary bodies (kept byte for byte). */
export function textOf(content: HarContent): string | null {
  if (content.text === undefined) return null;
  if (content.encoding !== 'base64') return content.text;
  const mime = content.mimeType ?? '';
  return /^(text\/|application\/(json|javascript|x-javascript|xml))|\+json|\+xml/.test(mime)
    ? Buffer.from(content.text, 'base64').toString('utf8')
    : null;
}
