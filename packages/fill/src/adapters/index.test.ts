import { describe, expect, it } from 'vitest';
import { adapterFor } from './index';

describe('adapterFor', () => {
  it.each([
    ['https://job-boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://jobs.lever.co/acme/0b2c/apply', 'lever'],
    ['https://jobs.ashbyhq.com/acme/0b2c/application', 'ashby'],
    ['https://careers.example.com/jobs?gh_jid=123', 'generic'],
  ])('%s -> %s', (url, ats) => {
    expect(adapterFor(new URL(url)).ats).toBe(ats);
  });
});
