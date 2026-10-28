import { describe, expect, it } from 'vitest';
import openai from '../../../../fixtures/ashby/openai-2026-10-28.html?raw';
import anthropic from '../../../../fixtures/greenhouse/anthropic-2026-10-28.html?raw';
import eqbank from '../../../../fixtures/lever/eqbank-2026-10-28.html?raw';
import { loadPage, render } from '../test-support/dom';
import {
  canonicalPostingUrl,
  countriesIn,
  parsePublicPosting,
  postingKeyFromUrl,
  publicApiRequest,
  readPosting,
} from './index';

describe('Posting keys and URLs', () => {
  it.each([
    ['https://job-boards.greenhouse.io/acme/jobs/123', { ats: 'greenhouse', employer: 'acme', jobId: '123' }],
    [
      'https://job-boards.greenhouse.io/embed/job_app?for=mongodb&token=8258279',
      { ats: 'greenhouse', employer: 'mongodb', jobId: '8258279' },
    ],
    [
      'https://jobs.lever.co/EQBank/a20b80c5-53c4-4c34-b8de-c6d9208994a6/apply',
      { ats: 'lever', employer: 'eqbank', jobId: 'a20b80c5-53c4-4c34-b8de-c6d9208994a6' },
    ],
    [
      'https://jobs.ashbyhq.com/openai/3c67f712-697d-48d8-b05c-01be896e61da/application',
      { ats: 'ashby', employer: 'openai', jobId: '3c67f712-697d-48d8-b05c-01be896e61da' },
    ],
  ] as const)('%s', (url, key) => {
    expect(postingKeyFromUrl(new URL(url))).toEqual(key);
  });

  it('is null for pages that are not Postings', () => {
    expect(postingKeyFromUrl(new URL('https://job-boards.greenhouse.io/acme'))).toBeNull();
    expect(postingKeyFromUrl(new URL('https://example.com/jobs/1'))).toBeNull();
  });

  it('drops tracking parameters but keeps the ones that name the job', () => {
    const url = canonicalPostingUrl(
      new URL('https://careers.example.com/jobs?gh_jid=123&utm_source=x&gh_src=y&lever-source=z#apply'),
    );
    expect(url.href).toBe('https://careers.example.com/jobs?gh_jid=123');
  });
});

describe('countriesIn', () => {
  it.each([
    ['San Francisco, CA | Seattle, WA', ['US']],
    ['Toronto, ON', ['CA']],
    ['Oakville, Ontario - Canada', ['CA']],
    ['Remote - US', ['US']],
    ['London, UK; Ontario, CAN', ['GB', 'CA']],
    ['Munich - London', ['DE', 'GB']],
    ['Remote', []],
  ])('%s → %o', (location, countries) => {
    expect(countriesIn(location)).toEqual(countries);
  });
});

describe('readPosting', () => {
  it('Greenhouse: title, company, location and country from the page', () => {
    loadPage(anthropic);
    expect(
      readPosting(document, new URL('https://job-boards.greenhouse.io/anthropic/jobs/5456619008')),
    ).toMatchObject({
      key: { ats: 'greenhouse', employer: 'anthropic', jobId: '5456619008' },
      title: '3P Revenue Accounting & Reporting',
      company: 'Anthropic',
      location: 'San Francisco, CA | Seattle, WA',
      country: 'US',
    });
  });

  it('Lever: from the headline and categories', () => {
    loadPage(eqbank);
    expect(
      readPosting(
        document,
        new URL('https://jobs.lever.co/eqbank/a20b80c5-53c4-4c34-b8de-c6d9208994a6/apply'),
      ),
    ).toMatchObject({
      title: 'AI Solutions Engineer, Technology Workplace Services',
      location: 'Toronto',
      country: 'CA',
    });
  });

  it('Ashby: from schema.org JobPosting JSON-LD, description as text', () => {
    loadPage(openai);
    const posting = readPosting(
      document,
      new URL('https://jobs.ashbyhq.com/openai/3c67f712-697d-48d8-b05c-01be896e61da/application'),
    );
    expect(posting).toMatchObject({
      title: 'Software Engineer, Scaled Abuse',
      company: 'OpenAI',
      country: 'US',
    });
    expect(posting?.description).toMatch(/^About the team/);
  });

  it('a company page embedding Greenhouse is keyed by the embed', () => {
    render(
      '<iframe id="grnhse_iframe" src="https://job-boards.greenhouse.io/embed/job_app?for=acme&token=42"></iframe>',
    );
    expect(readPosting(document, new URL('https://careers.example.com/jobs?gh_jid=42'))?.key).toEqual({
      ats: 'greenhouse',
      employer: 'acme',
      jobId: '42',
    });
  });
});

describe('public job APIs', () => {
  it('builds requests only for allowlisted public API hosts', () => {
    expect(publicApiRequest({ ats: 'greenhouse', employer: 'acme', jobId: '1' })?.url).toBe(
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1?questions=true&pay_transparency=true',
    );
    expect(
      publicApiRequest(
        { ats: 'lever', employer: 'acme', jobId: 'x' },
        new URL('https://jobs.eu.lever.co/acme/x'),
      )?.url,
    ).toBe('https://api.eu.lever.co/v0/postings/acme/x?mode=json');
    expect(publicApiRequest({ ats: 'generic', employer: 'example.com', jobId: '/' })).toBeNull();
  });

  it('reads Greenhouse answers, including options its menus only render when open', () => {
    const json = {
      title: 'Engineer',
      company_name: 'Acme',
      location: { name: 'Toronto, ON' },
      content: '&lt;p&gt;Build &amp;amp; ship.&lt;/p&gt;',
      questions: [
        {
          label: 'Sponsorship?',
          fields: [
            {
              name: 'question_1',
              type: 'multi_value_single_select',
              values: [
                { label: 'Yes', value: 1 },
                { label: 'No', value: 0 },
              ],
            },
          ],
        },
      ],
    };
    const result = parsePublicPosting({ ats: 'greenhouse', employer: 'acme', jobId: '1' }, json);
    expect(result).toEqual({
      ok: true,
      value: {
        title: 'Engineer',
        company: 'Acme',
        location: 'Toronto, ON',
        country: 'CA',
        description: 'Build & ship.',
        fieldOptions: { question_1: ['Yes', 'No'] },
      },
    });
  });

  it('finds the Posting on an Ashby board, and says so when it is gone', () => {
    const board = {
      jobs: [
        {
          id: 'j1',
          title: 'Engineer',
          location: 'Remote',
          address: { postalAddress: { addressCountry: 'Canada' } },
        },
      ],
    };
    expect(parsePublicPosting({ ats: 'ashby', employer: 'acme', jobId: 'j1' }, board)).toMatchObject({
      ok: true,
      value: { title: 'Engineer', country: 'CA' },
    });
    expect(parsePublicPosting({ ats: 'ashby', employer: 'acme', jobId: 'j2' }, board)).toMatchObject({
      ok: false,
      error: { reason: 'postingNotFound' },
    });
  });
});
