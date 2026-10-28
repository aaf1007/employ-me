import { describe, expect, it } from 'vitest';
import { backstop } from './backstop';

const ASHBY = 'https://jobs.ashbyhq.com/api/non-user-graphql?op=';

describe('the live harness backstop', () => {
  it('lets reads through', () => {
    expect(backstop('GET', 'https://job-boards.greenhouse.io/affirm/jobs/1', null)).toBe('allow');
    expect(backstop('HEAD', 'https://jobs.lever.co/x', null)).toBe('allow');
  });

  it('aborts every write, on any host', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(backstop(method, 'https://job-boards.greenhouse.io/affirm/jobs/1', '{}')).toBe('abort');
      expect(backstop(method, 'https://jobs.lever.co/wave/1/apply', 'a=b')).toBe('abort');
      expect(backstop(method, 'https://example.s3.amazonaws.com/', null)).toBe('abort');
    }
  });

  it('passes an Ashby GraphQL query, which can’t change anything', () => {
    const body = JSON.stringify({
      operationName: 'ApiJobPosting',
      variables: { jobPostingId: '1' },
      query: 'query ApiJobPosting($jobPostingId: String!) { jobPosting(id: $jobPostingId) { id title } }',
    });
    expect(backstop('POST', `${ASHBY}ApiJobPosting`, body)).toBe('readQuery');
  });

  it('aborts Ashby mutations, however they are dressed up', () => {
    const mutation = (query: string) => JSON.stringify({ operationName: 'ApiJobPosting', query });
    const submit = 'mutation ApiSubmitSingleApplicationFormAction { submit { ok } }';
    expect(backstop('POST', `${ASHBY}ApiSubmitSingleApplicationFormAction`, mutation(submit))).toBe('abort');
    expect(backstop('POST', `${ASHBY}ApiJobPosting`, mutation(submit))).toBe('abort');
    expect(backstop('POST', `${ASHBY}ApiJobPosting`, mutation(`query A { a } ${submit}`))).toBe('abort');
    expect(backstop('POST', `${ASHBY}ApiJobPosting`, mutation('query A { a } query B { b }'))).toBe('abort');
    expect(backstop('POST', `${ASHBY}ApiSetFormValue`, mutation('mutation ApiSetFormValue { x }'))).toBe(
      'abort',
    );
    expect(backstop('POST', `${ASHBY}ApiJobPosting`, JSON.stringify([{ query: 'query A { a }' }]))).toBe(
      'abort',
    );
    expect(backstop('POST', `${ASHBY}ApiJobPosting`, 'not json')).toBe('abort');
    expect(backstop('POST', `${ASHBY}ApiJobPosting`, null)).toBe('abort');
    expect(backstop('PUT', `${ASHBY}ApiJobPosting`, mutation('query A { a }'))).toBe('abort');
  });

  it('passes queries only on Ashby’s own GraphQL endpoint', () => {
    const body = JSON.stringify({ query: 'query A { a }' });
    expect(backstop('POST', 'https://jobs.ashbyhq.com/api/other', body)).toBe('abort');
    expect(backstop('POST', 'https://evil.example.com/api/non-user-graphql', body)).toBe('abort');
  });
});
