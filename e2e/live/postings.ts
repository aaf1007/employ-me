import type { LiveProvider } from './ledger';

// Live, public Postings the harness fills (chosen 2026-10-28 from each ATS's
// public job API). Opened at the Application Form's own URL: the specs never
// click Apply, Next or Submit.

export interface LivePosting {
  readonly id: string;
  readonly ats: 'greenhouse' | 'lever' | 'ashby';
  readonly url: string;
  /** Where the job is, as the Posting says. */
  readonly where: string;
  /** A field the form shows once it has rendered, in the form's frame. */
  readonly ready: string;
  /** Part of the form frame's URL, for a form embedded in a company site. */
  readonly formFrame?: string;
  /** Which Provider runs this Posting's Fill. */
  readonly provider: LiveProvider;
  /** The most real calls its Fill may make (mapFields rounds plus required Drafts). */
  readonly maxCalls: number;
}

const GH = '#first_name';
const LEVER = 'input[name="email"]';
const ASHBY = '#_systemfield_email';

export const POSTINGS: readonly LivePosting[] = [
  {
    id: 'gh-affirm',
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/affirm/jobs/8009657003',
    where: 'Remote Canada',
    ready: GH,
    provider: 'claude',
    maxCalls: 3,
  },
  {
    id: 'gh-geotab',
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/geotab/jobs/5453368008',
    where: 'Waterloo, Ontario',
    ready: GH,
    provider: 'codex',
    maxCalls: 3,
  },
  {
    id: 'gh-databricks-embed',
    ats: 'greenhouse',
    url: 'https://databricks.com/company/careers/open-positions/job?gh_jid=8635216002',
    where: 'Mountain View, California',
    ready: GH,
    formFrame: 'greenhouse.io/embed/job_app',
    provider: 'claude',
    maxCalls: 3,
  },
  {
    id: 'gh-discord',
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/discord/jobs/8659978002',
    where: 'San Francisco Bay Area',
    ready: GH,
    provider: 'codex',
    maxCalls: 3,
  },
  {
    id: 'lv-wave',
    ats: 'lever',
    url: 'https://jobs.lever.co/waveapps/161455b7-7553-4112-943f-d46668d471e8/apply',
    where: 'Canada',
    ready: LEVER,
    provider: 'codex',
    maxCalls: 3,
  },
  {
    id: 'lv-pointclickcare',
    ats: 'lever',
    url: 'https://jobs.lever.co/pointclickcare/e56d6df3-16fb-4652-9d97-c6140700d2e0/apply',
    where: 'Remote or Mississauga',
    ready: LEVER,
    provider: 'claude',
    maxCalls: 3,
  },
  {
    id: 'lv-zoox',
    ats: 'lever',
    url: 'https://jobs.lever.co/zoox/0dd5de4b-4e98-4808-85fd-e739e7fc5bba/apply',
    where: 'San Diego, CA',
    ready: LEVER,
    provider: 'codex',
    maxCalls: 3,
  },
  {
    id: 'lv-palantir',
    ats: 'lever',
    url: 'https://jobs.lever.co/palantir/ab7e3425-81d5-4705-a7b5-cd60c8a45cdb/apply',
    where: 'New York, NY',
    ready: LEVER,
    provider: 'claude',
    maxCalls: 3,
  },
  {
    id: 'ab-cohere',
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/cohere/7133d205-5421-4336-a8e2-6037b5f55073/application',
    where: 'Toronto',
    ready: ASHBY,
    provider: 'claude',
    maxCalls: 3,
  },
  {
    id: 'ab-notion',
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/notion/1fc309c8-da20-4ff2-84c7-8b863ece2b0a/application',
    where: 'San Francisco, California',
    ready: ASHBY,
    provider: 'codex',
    maxCalls: 3,
  },
  {
    id: 'ab-1password',
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/1password/6f78b170-9600-4b2d-9682-feead160100d/application',
    where: 'Remote (United States | Canada)',
    ready: ASHBY,
    provider: 'claude',
    maxCalls: 3,
  },
  {
    id: 'ab-ramp',
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/ramp/4e64ab86-4e30-403b-b1b9-41dc052570ce/application',
    where: 'New York, NY',
    ready: ASHBY,
    provider: 'codex',
    maxCalls: 4,
  },
];
