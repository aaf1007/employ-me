import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicJson, fetchPublicPosting } from './ats-public-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPublicJson', () => {
  it.each([
    'https://example.com/collect',
    'https://job-boards.greenhouse.io/acme/jobs/1',
    'http://boards-api.greenhouse.io/v1/boards/acme/jobs/1',
  ])('refuses %s', async (url) => {
    expect(await fetchPublicJson(new URL(url))).toMatchObject({
      ok: false,
      error: { reason: 'hostNotAllowed' },
    });
  });
});

describe('fetchPublicPosting', () => {
  const key = { ats: 'greenhouse', employer: 'acme', jobId: '123' } as const;

  it('GETs the Posting from the public API without cookies, and reads its description', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal('fetch', (url: URL, init?: RequestInit) => {
      calls.push({ url: url.href, init });
      const body = {
        title: 'Engineer',
        content: '&lt;p&gt;Build things.&lt;/p&gt;',
        location: { name: 'Toronto' },
      };
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    expect(await fetchPublicPosting(key)).toMatchObject({
      ok: true,
      value: { title: 'Engineer', description: 'Build things.' },
    });
    expect(calls.map((c) => c.url)).toEqual([
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123?questions=true&pay_transparency=true',
    ]);
    expect(calls[0]?.init).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
  });

  it('turns a failed request into a typed error', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 404 })));
    expect(await fetchPublicPosting(key)).toMatchObject({ ok: false, error: { reason: 'httpStatus' } });
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await fetchPublicPosting(key)).toMatchObject({ ok: false, error: { reason: 'network' } });
  });

  it('has nothing to ask for the generic fallback', async () => {
    const generic = { ats: 'generic', employer: 'acme.example', jobId: '/jobs/1' } as const;
    expect(await fetchPublicPosting(generic)).toMatchObject({ ok: false, error: { reason: 'noPublicApi' } });
  });
});
