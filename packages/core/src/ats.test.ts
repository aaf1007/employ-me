import { describe, expect, it } from 'vitest';
import {
  atsForFormHost,
  formMatchPatterns,
  isPublicApiHost,
  isPublicApiUrl,
  publicApiMatchPatterns,
} from './ats';

describe('atsForFormHost', () => {
  it.each([
    ['job-boards.greenhouse.io', 'greenhouse'],
    ['jobs.lever.co', 'lever'],
    ['jobs.ashbyhq.com', 'ashby'],
    ['rbc.wd3.myworkdayjobs.com', 'workday'],
    ['NVIDIA.wd5.myworkdayjobs.com', 'workday'],
    ['wd1.myworkdaysite.com', 'workday'],
  ])('%s -> %s', (host, ats) => {
    expect(atsForFormHost(host)).toBe(ats);
  });

  it.each([
    'myworkdayjobs.com',
    'myworkdayjobs.com.example.com',
    'evilmyworkdayjobs.com',
    'www.linkedin.com',
  ])('knows nothing of %s', (host) => {
    expect(atsForFormHost(host)).toBeNull();
  });
});

describe('the public job API allowlist', () => {
  it('allows only Workday CXS paths on Workday hosts', () => {
    expect(
      isPublicApiUrl(new URL('https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/job/x_R-1')),
    ).toBe(true);
    expect(isPublicApiUrl(new URL('https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/x_R-1'))).toBe(false);
    expect(isPublicApiUrl(new URL('http://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/job/x'))).toBe(
      false,
    );
  });

  it('allows any path on dedicated API hosts', () => {
    expect(isPublicApiUrl(new URL('https://boards-api.greenhouse.io/v1/boards/acme/jobs/1'))).toBe(true);
    expect(isPublicApiUrl(new URL('https://job-boards.greenhouse.io/acme/jobs/1'))).toBe(false);
    expect(isPublicApiHost('api.lever.co')).toBe(true);
  });

  it('derives match patterns, with the API path where there is one', () => {
    expect(formMatchPatterns()).toContain('https://*.myworkdayjobs.com/*');
    expect(publicApiMatchPatterns()).toContain('https://*.myworkdayjobs.com/wday/cxs/*');
    expect(publicApiMatchPatterns()).toContain('https://boards-api.greenhouse.io/*');
  });
});
