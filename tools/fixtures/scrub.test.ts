import { describe, expect, it } from 'vitest';
import type { HarEntry } from './har.ts';
import { collectSecrets, keepEntry, redact, scrubEntry } from './scrub.ts';

function entry(url: string, body: string, extra: Partial<HarEntry['request']> = {}): HarEntry {
  return {
    startedDateTime: '2026-10-28T00:00:00Z',
    time: 1,
    request: {
      method: 'GET',
      url,
      httpVersion: 'HTTP/2',
      headers: [{ name: 'cookie', value: 'session=abc' }],
      queryString: [],
      cookies: [{ name: 'session', value: 'abc' }],
      headersSize: -1,
      bodySize: 0,
      ...extra,
    },
    response: {
      status: 200,
      statusText: 'OK',
      httpVersion: 'HTTP/2',
      headers: [
        { name: 'content-type', value: 'application/json' },
        { name: 'set-cookie', value: 'session=abc' },
        { name: 'content-length', value: '10' },
      ],
      cookies: [{ name: 'session', value: 'abc' }],
      content: { size: body.length, mimeType: 'application/json', text: body },
      redirectURL: '',
      headersSize: -1,
      bodySize: -1,
    },
    cache: {},
    timings: {},
  };
}

describe('fixture scrubbing', () => {
  it('keeps only the fixture’s own hosts, GETs and Ashby read queries, never media or beacons', () => {
    const hosts = { hosts: ['jobs.ashbyhq.com'] };
    expect(keepEntry(entry('https://jobs.ashbyhq.com/acme', '{}'), hosts)).toBe(true);
    expect(keepEntry(entry('https://tracker.example.com/t', '{}'), hosts)).toBe(false);
    expect(keepEntry(entry('https://jobs.ashbyhq.com/cdn-cgi/challenge', '{}'), hosts)).toBe(false);
    const post = (op: string) => entry(`https://jobs.ashbyhq.com/api/non-user-graphql?op=${op}`, '{}', { method: 'POST' });
    expect(keepEntry(post('ApiJobPosting'), hosts)).toBe(true);
    expect(keepEntry(post('ApiSubmitSingleApplicationFormAction'), hosts)).toBe(false);
  });

  it('finds client keys and tokens and replaces them everywhere, consistently', () => {
    const page = entry(
      'https://job-boards.greenhouse.io/embed/job_app?for=acme&validityToken=SECRET-TOKEN-1&token=123',
      'window.ENV = {"LOCATION_CONTROL_API_KEY":"ge-0123456789abcdef","ASSET_URL":"https://cdn"}',
    );
    const secrets = collectSecrets([page], []);
    expect(secrets).toEqual(expect.arrayContaining(['SECRET-TOKEN-1', 'ge-0123456789abcdef']));
    // The job id travels as `token=` on Greenhouse embeds: it stays.
    expect(secrets).not.toContain('123');
    const scrubbed = scrubEntry(page, secrets);
    expect(scrubbed.request.url).not.toContain('SECRET-TOKEN-1');
    expect(scrubbed.request.url).toContain('token=123');
    expect(scrubbed.response.content.text).not.toContain('ge-0123456789abcdef');
    // Same placeholder in the URL and the body, so the scrubbed page still asks for what the HAR holds.
    const placeholder = redact('ge-0123456789abcdef', secrets);
    expect(redact('https://geo?api_key=ge-0123456789abcdef', secrets)).toBe(`https://geo?api_key=${placeholder}`);
  });

  it('drops cookies and session headers, and blanks signed upload policies', () => {
    const presigned = entry(
      'https://boards.greenhouse.io/uncacheable_attributes/presigned_fields',
      '{"resume":{"fields":{"policy":"abc","x-amz-signature":"def","key":"stash/x"}}}',
    );
    const scrubbed = scrubEntry(presigned, []);
    expect(scrubbed.request.cookies).toEqual([]);
    expect(scrubbed.request.headers).toEqual([]);
    expect(scrubbed.response.cookies).toEqual([]);
    expect(scrubbed.response.headers).toEqual([{ name: 'content-type', value: 'application/json' }]);
    expect(JSON.parse(scrubbed.response.content.text ?? '')).toEqual({
      resume: { fields: { policy: 'redacted', 'x-amz-signature': 'redacted', key: 'stash/x' } },
    });
  });
});
