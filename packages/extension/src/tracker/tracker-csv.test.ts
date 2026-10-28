import { describe, expect, it } from 'vitest';
import { createTestStore, posting, value } from '../storage/test-store';
import { parseCsv } from './csv';
import { postingKeyFor } from './posting-key';
import { appliedAtFrom, applicationsToCsv, EMPTY_MAPPING, guessMapping, previewImport } from './tracker-csv';

const now = new Date('2026-10-27T18:00:00Z');

function rowsOf(csv: string): string[][] {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

describe('Tracker CSV', () => {
  it('exports every Application and imports it back the same, without Snapshots', async () => {
    const { store } = await createTestStore();
    value(
      await store.createApplication({
        source: 'confirmation',
        posting: posting('1', { title: '=Senior, "Platform" Engineer' }),
        snapshot: { capturedAt: '2026-10-27T12:00:00Z', postingDescription: 'JD', answers: [], resume: null },
      }),
    );
    value(
      await store.createApplication({
        source: 'manual',
        posting: posting('2', { company: 'Initech', country: 'US', location: undefined }),
        status: 'interviewing',
        notes: 'Phone screen\nwith Pat',
        appliedAt: '2026-10-01T16:00:00.000Z',
      }),
    );
    const exported = applicationsToCsv(value(await store.listApplications()));

    const rows = rowsOf(exported);
    const preview = previewImport(rows, guessMapping(rows[0] ?? []), now);
    expect(preview.problems).toEqual([]);
    expect(preview.warnings).toEqual([]);

    const { store: other } = await createTestStore();
    expect(value(await other.importApplications(preview.ready))).toEqual({ added: 2, duplicates: [] });
    const strip = (csv: string) => rowsOf(csv).map((row) => row.slice(0, -2)); // Source and Snapshot change: imported, no Snapshot.
    const reexported = applicationsToCsv(value(await other.listApplications()));
    expect(strip(reexported)).toEqual(strip(exported));
    expect(
      rowsOf(reexported)
        .slice(1)
        .map((row) => row.slice(-2)),
    ).toEqual([
      ['import', 'no'],
      ['import', 'no'],
    ]);
  });

  it('imports a spreadsheet from elsewhere with the columns you map', () => {
    const rows = rowsOf(
      [
        'Employer,Role,Link,When,Stage,Where,Comments',
        'Acme,Engineer,https://job-boards.greenhouse.io/acme/jobs/123,2026-10-20,Interviewing,Canada,Nice team',
        'Globex,Designer,https://careers.globex.example/jobs/9?utm_source=x,Oct 3 2026,,USA,',
        ',Nobody,https://example.com/1,2026-10-01,,,',
        'Initech,PM,not a link,2026-10-01,,,',
        'Hooli,SRE,https://hooli.example/j/1,yesterday-ish,,,',
        'Pied Piper,CEO,https://piedpiper.example/j/1,,Hired,,',
        'Umbrella,QA,https://umbrella.example/j/2,,,Atlantis,',
      ].join('\n'),
    );
    const mapping = {
      ...EMPTY_MAPPING,
      company: 0,
      title: 1,
      url: 2,
      appliedAt: 3,
      status: 4,
      country: 5,
      notes: 6,
    };
    const preview = previewImport(rows, mapping, now);

    expect(preview.ready.map((a) => a.posting.company)).toEqual(['Acme', 'Globex', 'Umbrella']);
    expect(preview.ready[0]).toMatchObject({
      source: 'import',
      status: 'interviewing',
      appliedAt: '2026-10-20T12:00:00.000Z',
      notes: 'Nice team',
      posting: {
        key: { ats: 'greenhouse', employer: 'acme', jobId: '123' },
        title: 'Engineer',
        country: 'CA',
      },
    });
    expect(preview.ready[1]).toMatchObject({
      status: 'applied',
      posting: { country: 'US', key: { ats: 'generic' } },
    });
    expect(preview.ready[2]?.appliedAt).toBe(now.toISOString());
    expect(preview.problems.map((p) => p.row)).toEqual([4, 5, 6, 7]);
    expect(preview.problems[0]?.message).toBe('No company.');
    expect(preview.problems[3]?.message).toMatch(/^Unknown Status/);
    expect(preview.warnings).toEqual([
      { row: 8, message: 'No applied date: today’s date is used.' },
      { row: 8, message: 'Country not recognized: left empty.' },
    ]);
  });

  it('guesses the mapping from headers, case-insensitively', () => {
    expect(guessMapping(['URL', ' company ', 'Job Title', 'Unrelated'])).toMatchObject({
      url: 0,
      company: 1,
      title: 2,
      notes: null,
    });
  });

  it('reads applied dates', () => {
    expect(appliedAtFrom('2026-10-27', now)).toEqual({ value: '2026-10-27T12:00:00.000Z', assumed: false });
    expect(appliedAtFrom('2026-10-27T09:30:00-07:00', now)).toEqual({
      value: '2026-10-27T16:30:00.000Z',
      assumed: false,
    });
    expect(appliedAtFrom('2026-02-31', now)).toBeNull();
    expect(appliedAtFrom('soon', now)).toBeNull();
  });
});

describe('postingKeyFor', () => {
  it('reads the board and job id from known ATS URLs', () => {
    expect(
      postingKeyFor(new URL('https://job-boards.greenhouse.io/Acme/jobs/4567?gh_src=x'), 'Acme'),
    ).toEqual({
      ats: 'greenhouse',
      employer: 'acme',
      jobId: '4567',
    });
    expect(
      postingKeyFor(new URL('https://jobs.lever.co/acme/0B2C9A3E-1111-4222-8333-444455556666/apply'), 'Acme'),
    ).toEqual({ ats: 'lever', employer: 'acme', jobId: '0b2c9a3e-1111-4222-8333-444455556666' });
  });

  it.each([
    [
      'https://rbc.wd3.myworkdayjobs.com/en-US/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1',
      { ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' },
    ],
    [
      'https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/London-Ontario/Software-Engineer-I--Java-_R_1511543-1',
      { ats: 'workday', employer: 'td', jobId: 'R_1511543' },
    ],
    [
      'https://wd1.myworkdaysite.com/recruiting/osu/OSUCareers/details/Research-Engineer_R123456',
      { ats: 'workday', employer: 'osu', jobId: 'R123456' },
    ],
  ])('keys Workday Postings as the fill engine does: %s', (url, key) => {
    expect(postingKeyFor(new URL(url), 'Acme')).toEqual(key);
  });

  it('keys anything else by company and URL', () => {
    expect(postingKeyFor(new URL('https://Careers.Example.com/jobs/9/'), 'Café Société')).toEqual({
      ats: 'generic',
      employer: 'cafe-societe',
      jobId: 'careers.example.com/jobs/9',
    });
  });
});
