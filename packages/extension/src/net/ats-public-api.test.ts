import { describe, expect, it } from 'vitest';
import { fetchPublicJson } from './ats-public-api';

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
