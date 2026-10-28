// The recorded Application Forms: one entry per HAR fixture. The recorder
// (tools/fixtures/record.ts) and the fill specs (e2e/fill.spec.ts) both read
// this list. Fixtures are real, public postings recorded on the date in their
// name; nothing was ever submitted.

export type FixtureAts = 'greenhouse' | 'lever' | 'ashby' | 'generic';

/** Text typed into one field while recording, so the HAR holds its autocomplete responses. */
export interface RecordedTyping {
  readonly selector: string;
  readonly text: string;
  /** Send real key presses (Lever searches on keydown), instead of setting the value at once. */
  readonly keystrokes?: boolean;
}

export interface FormFixture {
  /** `<ats>/<employer>-<yyyy-mm-dd>`: fixtures/<name>.har, .html and .expected.json. */
  readonly name: string;
  readonly ats: FixtureAts;
  /** The page as a candidate opens it. */
  readonly url: string;
  /** Substring of the URL of the frame holding the form, when it is embedded. */
  readonly formFrame?: string;
  /** What the fixture covers, for the README table and reviewers. */
  readonly covers: string;
  /** Hosts whose responses are kept in the HAR. Everything else is dropped. */
  readonly hosts: readonly string[];
  readonly typing?: readonly RecordedTyping[];
}

const GREENHOUSE_HOSTS = [
  'job-boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.cdn.greenhouse.io',
  'api-geocode-earth-proxy.greenhouse.io',
];
const LEVER_HOSTS = ['jobs.lever.co', 'jobs.eu.lever.co'];
const ASHBY_HOSTS = ['jobs.ashbyhq.com', 'cdn.ashbyprd.com'];

const GREENHOUSE_LOCATION: RecordedTyping = { selector: '#candidate-location', text: 'Toronto' };

export const FORMS: readonly FormFixture[] = [
  {
    name: 'greenhouse/anthropic-2026-10-28',
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/anthropic/jobs/5456619008',
    covers: 'US form with an EEO block, AI-policy question and an arbitration agreement',
    hosts: GREENHOUSE_HOSTS,
  },
  {
    name: 'greenhouse/mongodb-2026-10-28',
    ats: 'greenhouse',
    url: 'https://www.mongodb.com/careers/job/?gh_jid=8258279',
    formFrame: 'job-boards.greenhouse.io/embed/job_app',
    covers: 'Board embedded in a company site (#grnhse_iframe), Dublin, GDPR demographic consent',
    hosts: [...GREENHOUSE_HOSTS, 'www.mongodb.com'],
    typing: [GREENHOUSE_LOCATION],
  },
  {
    name: 'greenhouse/getyourguide-2026-10-28',
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/getyourguide/jobs/8173479',
    covers: 'EU (Berlin) form with GDPR retention consent and checkbox groups',
    hosts: GREENHOUSE_HOSTS,
    typing: [GREENHOUSE_LOCATION],
  },
  {
    name: 'greenhouse/geotab-2026-10-28',
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/geotab/jobs/5423014008',
    covers: 'Canadian form (Oakville): education, expanded self-ID, GDPR demographic consent',
    hosts: GREENHOUSE_HOSTS,
    typing: [
      GREENHOUSE_LOCATION,
      // Schools load by search term; record both of the test Profile's.
      { selector: '#school--0', text: 'University of Waterloo', keystrokes: true },
      { selector: '#school--0', text: 'University of Toronto', keystrokes: true },
      { selector: '#degree--0', text: "Bachelor's" },
      { selector: '#discipline--0', text: 'Computer Science' },
    ],
  },
  {
    name: 'greenhouse/faire-2026-10-28',
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/faire/jobs/8821336002',
    covers: 'Canadian form (Toronto): province of residence, Indigenous and gender-identity self-ID',
    hosts: GREENHOUSE_HOSTS,
    typing: [GREENHOUSE_LOCATION],
  },
  {
    name: 'lever/eqbank-2026-10-28',
    ats: 'lever',
    url: 'https://jobs.lever.co/eqbank/a20b80c5-53c4-4c34-b8de-c6d9208994a6/apply',
    covers: 'Canadian form with employment-equity survey (Two-Spirit, Indigenous, visible minority)',
    hosts: LEVER_HOSTS,
    typing: [{ selector: '#location-input', text: 'Toronto', keystrokes: true }],
  },
  {
    name: 'lever/palantir-2026-10-28',
    ats: 'lever',
    url: 'https://jobs.lever.co/palantir/a5f93bb6-4f13-4451-80a4-f63090830269/apply',
    covers: 'US form with EEO veteran/disability selects, a disability signature and a consent radio',
    hosts: LEVER_HOSTS,
    typing: [{ selector: '#location-input', text: 'Toronto', keystrokes: true }],
  },
  {
    name: 'lever/spotify-2026-10-28',
    ats: 'lever',
    url: 'https://jobs.lever.co/spotify/2d67c471-9015-41c0-a041-b982ec4a14fd/apply',
    covers: 'UK form: pronoun checkboxes, several diversity surveys, marketing consent',
    hosts: LEVER_HOSTS,
    typing: [{ selector: '#location-input', text: 'Toronto', keystrokes: true }],
  },
  {
    name: 'ashby/wealthsimple-2026-10-28',
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/wealthsimple/eeb6b49e-cd1a-4ac0-ab93-67dbc631758d/application',
    covers: 'Canadian form: Yes/No buttons, recording consent, location autocomplete',
    hosts: ASHBY_HOSTS,
    typing: [{ selector: 'input[role="combobox"]', text: 'Toronto' }],
  },
  {
    name: 'ashby/openai-2026-10-28',
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/openai/3c67f712-697d-48d8-b05c-01be896e61da/application',
    covers: 'US form: EEOC radios, Yes/No buttons, arbitration acknowledgements',
    hosts: ASHBY_HOSTS,
    typing: [{ selector: 'input[role="combobox"]', text: 'Toronto' }],
  },
  {
    name: 'ashby/elevenlabs-2026-10-28',
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/elevenlabs/c7d59014-b918-4c15-ae33-79f5c9f2cf9f/application',
    covers: 'UK form: a country picker, radio groups and several free-text questions',
    hosts: ASHBY_HOSTS,
    typing: [{ selector: 'input[role="combobox"]', text: 'Canada' }],
  },
  {
    name: 'generic/helsing-2026-10-28',
    ats: 'generic',
    url: 'https://helsing.ai/jobs/4927641101?gh_jid=4927641101',
    covers: "A company's own form (Munich or London) on an unrecognised site",
    hosts: ['helsing.ai'],
  },
];

export function formFixture(name: string): FormFixture {
  const form = FORMS.find((f) => f.name === name);
  if (form === undefined) throw new Error(`No form fixture named ${name}`);
  return form;
}
