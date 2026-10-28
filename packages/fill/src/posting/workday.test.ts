import { describe, expect, it } from 'vitest';
import nvidiaApi from '../../../../fixtures/workday/nvidia-2026-10-28.cxs.json';
import nvidiaPage from '../../../../fixtures/workday/nvidia-2026-10-28.posting.html?raw';
import rbcApi from '../../../../fixtures/workday/rbc-2026-10-28.cxs.json';
import rbcPage from '../../../../fixtures/workday/rbc-2026-10-28.posting.html?raw';
import { loadPage } from '../test-support/dom';
import { parsePublicPosting, postingKeyFromUrl, publicApiRequest, readPosting } from './index';

// Workday's public Posting data, recorded 2026-10-28 (fixtures/workday/):
// the server-rendered posting pages and the CXS job API's answers.

const RBC = new URL(
  'https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1',
);
const NVIDIA = new URL(
  'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825',
);

describe('Workday Posting keys', () => {
  it.each([
    [RBC.href, { ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' }],
    [`${RBC.href}/apply/applyManually`, { ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' }],
    [
      // Another copy of the same requisition is the same Posting (research §7).
      'https://rbc.wd3.myworkdayjobs.com/en-US/RBCGLOBAL1/job/MONTREAL-Quebec-Canada/Lead-Software-Developer_R-0000187445-2',
      { ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' },
    ],
    [
      // The id itself holds "_": the first "_" ends the title slug.
      'https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/London-Ontario/Software-Engineer-I--Java-_R_1511543-1',
      { ats: 'workday', employer: 'td', jobId: 'R_1511543' },
    ],
    [
      'https://sunlife.wd3.myworkdayjobs.com/en-US/Experienced-Jobs/job/Lead-Engineers_JR00128860',
      { ats: 'workday', employer: 'sunlife', jobId: 'JR00128860' },
    ],
    [
      'https://wd1.myworkdaysite.com/en-US/recruiting/osu/OSUCareers/details/Research-Engineer_R123456',
      { ats: 'workday', employer: 'osu', jobId: 'R123456' },
    ],
  ] as const)('%s', (url, key) => {
    expect(postingKeyFromUrl(new URL(url))).toEqual(key);
  });

  it('is null off a Posting', () => {
    expect(postingKeyFromUrl(new URL('https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1'))).toBeNull();
    expect(postingKeyFromUrl(new URL('https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/userHome'))).toBeNull();
  });
});

describe('the Workday CXS job API', () => {
  it('asks the form’s own host, under /wday/cxs/', () => {
    const key = { ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' } as const;
    expect(publicApiRequest(key, new URL(`${RBC.href}/apply/applyManually`))?.url).toBe(
      'https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1',
    );
    // Without the form's URL there is no host to ask, and a URL for another Posting is not used.
    expect(publicApiRequest(key)).toBeNull();
    expect(publicApiRequest(key, NVIDIA)).toBeNull();
  });

  it('reads the recorded RBC answer: title, company, Canada, the description as text', () => {
    const result = parsePublicPosting({ ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' }, rbcApi);
    expect(result).toMatchObject({
      ok: true,
      value: {
        title: 'Lead Software Developer',
        company: 'Royal Bank of Canada',
        location: 'TORONTO, Ontario, Canada',
        country: 'CA',
      },
    });
    expect(result.ok && result.value.description).toMatch(/^Job Description\s+As a Lead Software Developer/);
    expect(result.ok && result.value.description).not.toMatch(/<\/?\w+/);
  });

  it('reads the recorded NVIDIA answer: a US Posting', () => {
    expect(
      parsePublicPosting({ ats: 'workday', employer: 'nvidia', jobId: 'JR2020825' }, nvidiaApi),
    ).toMatchObject({
      ok: true,
      value: { title: 'Software Engineer, OpenShell', company: 'NVIDIA USA', country: 'US' },
    });
  });

  it('says so when the answer holds no Posting', () => {
    expect(
      parsePublicPosting({ ats: 'workday', employer: 'rbc', jobId: 'x' }, { errorCode: 'NOT_FOUND' }),
    ).toMatchObject({ ok: false, error: { reason: 'postingNotFound' } });
  });
});

describe('the recorded Workday posting pages', () => {
  it('RBC: JSON-LD gives the facts; the company drops its entity code', () => {
    loadPage(rbcPage);
    expect(readPosting(document, new URL(`${RBC.href}/apply/applyManually`))).toMatchObject({
      key: { ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' },
      url: RBC.href,
      title: 'Lead Software Developer',
      company: 'Royal Bank of Canada',
      country: 'CA',
    });
  });

  it('NVIDIA: a US Posting', () => {
    loadPage(nvidiaPage);
    expect(readPosting(document, NVIDIA)).toMatchObject({
      title: 'Software Engineer, OpenShell',
      company: 'NVIDIA USA',
      country: 'US',
    });
  });
});
