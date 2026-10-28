import { describe, expect, it } from 'vitest';
import { resumeWireSchema, type ResumeWire } from './parse-resume';
import { toResumeExtract } from './resume-extract';

const empty: ResumeWire = resumeWireSchema.parse({
  legalName: { first: null, middle: null, last: null },
  preferredName: { first: null, last: null },
  email: null,
  phone: { countryCode: null, number: null, type: null },
  address: { line1: null, line2: null, city: null, region: null, postalCode: null, country: null },
  links: { linkedin: null, github: null, portfolio: null },
  workHistory: [],
  education: [],
  skills: [],
  languages: [],
});

const job = (startDate: string | null) => ({
  employer: 'Acme',
  title: 'Engineer',
  location: null,
  startDate,
  endDate: '2023-04',
  current: true,
  description: null,
});

describe('toResumeExtract', () => {
  it('keeps what is valid and drops only what is not', () => {
    const extract = toResumeExtract({
      ...empty,
      legalName: { first: 'Sam', middle: null, last: 'Lee' },
      email: 'not-an-email',
      address: { ...empty.address, city: 'Toronto', country: 'ca' },
      links: { linkedin: 'linkedin.com/in/samlee', github: null, portfolio: null },
      workHistory: [job('2021-03'), job('2019')],
      skills: ['TypeScript', '  '],
    });
    expect(extract).toEqual({
      identity: { legalName: { first: 'Sam', last: 'Lee' } },
      address: { city: 'Toronto', country: 'CA' },
      links: { linkedin: 'https://linkedin.com/in/samlee' },
      background: {
        workHistory: [{ id: 'w1', employer: 'Acme', title: 'Engineer', startDate: '2021-03', current: true }],
        education: [],
        skills: [{ name: 'TypeScript', aliases: [] }],
        languages: [],
      },
    });
  });

  it('drops a job with no start date rather than failing the whole Resume', () => {
    const extract = toResumeExtract({ ...empty, workHistory: [job(null)] });
    expect(extract?.background?.workHistory).toEqual([]);
  });
});
