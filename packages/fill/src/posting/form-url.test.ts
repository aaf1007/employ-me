import { describe, expect, it } from 'vitest';
import { applicationFormUrl } from './index';

// The Application Form's address from a Posting's description page
// (design.md "Starting a Fill"). Ids are the recorded fixtures' (e2e/forms.ts).

const LEVER = 'https://jobs.lever.co/eqbank/a20b80c5-53c4-4c34-b8de-c6d9208994a6';
const ASHBY = 'https://jobs.ashbyhq.com/wealthsimple/eeb6b49e-cd1a-4ac0-ab93-67dbc631758d';
const WORKDAY =
  'https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1';

const formUrl = (href: string) => applicationFormUrl(new URL(href))?.href ?? null;

describe('applicationFormUrl', () => {
  it.each([
    [LEVER, `${LEVER}/apply`],
    [`${LEVER}/`, `${LEVER}/apply`],
    [
      'https://jobs.eu.lever.co/acme/2d67c471-9015-41c0-a041-b982ec4a14fd',
      'https://jobs.eu.lever.co/acme/2d67c471-9015-41c0-a041-b982ec4a14fd/apply',
    ],
    [ASHBY, `${ASHBY}/application`],
    [WORKDAY, `${WORKDAY}/apply/applyManually`],
    [
      'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825',
      'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825/apply/applyManually',
    ],
  ])('%s → %s', (page, form) => {
    expect(formUrl(page)).toBe(form);
  });

  it('keeps the query that picks the page, and drops tracking and the fragment', () => {
    expect(formUrl(`${LEVER}?lever-source=LinkedIn&utm_source=x&lang=en#top`)).toBe(`${LEVER}/apply?lang=en`);
  });

  it.each([
    ['the Lever form itself', `${LEVER}/apply`],
    ['the Ashby form itself', `${ASHBY}/application`],
    ['the Workday apply flow', `${WORKDAY}/apply/applyManually`],
    ['a Lever board', 'https://jobs.lever.co/eqbank'],
    ['an Ashby board', 'https://jobs.ashbyhq.com/wealthsimple'],
    ['a Lever path that is no Posting', 'https://jobs.lever.co/eqbank/not-a-posting'],
    // Greenhouse shows its form on the description page: Fill works there.
    ['a Greenhouse Posting', 'https://job-boards.greenhouse.io/anthropic/jobs/5456619008'],
    ['a Greenhouse embed', 'https://job-boards.greenhouse.io/embed/job_app?for=mongodb&token=8258279'],
    ['a Workday search page', 'https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1'],
    [
      'a Workday /details/ page',
      'https://wd1.myworkdaysite.com/en-US/recruiting/osu/OSUCareers/details/Research-Engineer_R123456',
    ],
    ['a company site', 'https://careers.example.org/jobs/42'],
  ])('is null for %s', (_what, page) => {
    expect(formUrl(page)).toBeNull();
  });

  it('stays on the Posting’s own host', () => {
    for (const page of [LEVER, ASHBY, WORKDAY]) {
      expect(new URL(formUrl(page) ?? '').host).toBe(new URL(page).host);
    }
  });
});
