import { atsIdSchema, postingSchema, type Posting } from '@employ-me/core';
import { countryCodeFrom } from '../reference';
import type { ApplicationSummary, ImportedApplication } from '../storage';
import { toCsv } from './csv';
import { postingKeyFor, postingUrl } from './posting-key';
import { STATUS_LABELS, statusFrom } from './status';

// The Tracker as CSV (design.md "Tracker features"). Export writes every
// Application; import lets you say which column is which, and imported
// Applications have no Snapshot.

const EXPORT_COLUMNS: readonly (readonly [string, (a: ApplicationSummary) => string])[] = [
  ['Company', (a) => a.posting.company ?? ''],
  ['Title', (a) => a.posting.title ?? ''],
  ['Location', (a) => a.posting.location ?? ''],
  ['Country', (a) => a.posting.country ?? ''],
  ['Status', (a) => STATUS_LABELS[a.status]],
  ['Applied', (a) => a.appliedAt],
  ['Notes', (a) => a.notes],
  ['URL', (a) => a.posting.url],
  ['ATS', (a) => a.posting.key.ats],
  ['Employer key', (a) => a.posting.key.employer],
  ['Job ID', (a) => a.posting.key.jobId],
  ['Source', (a) => a.source],
  ['Snapshot', (a) => (a.hasSnapshot ? 'yes' : 'no')],
];

export function applicationsToCsv(applications: readonly ApplicationSummary[]): string {
  return toCsv([
    EXPORT_COLUMNS.map(([header]) => header),
    ...applications.map((application) => EXPORT_COLUMNS.map(([, read]) => read(application))),
  ]);
}

export function csvFileName(now: Date): string {
  return `employ-me-applications-${now.toISOString().slice(0, 10)}.csv`;
}

export const IMPORT_FIELDS = [
  {
    id: 'company',
    label: 'Company',
    required: true,
    headers: ['company', 'company name', 'employer', 'organization'],
  },
  {
    id: 'url',
    label: 'Posting URL',
    required: true,
    headers: ['url', 'link', 'job url', 'posting url', 'job link'],
  },
  { id: 'title', label: 'Title', required: false, headers: ['title', 'job title', 'position', 'role'] },
  { id: 'location', label: 'Location', required: false, headers: ['location'] },
  { id: 'country', label: 'Country', required: false, headers: ['country'] },
  { id: 'status', label: 'Status', required: false, headers: ['status', 'stage'] },
  {
    id: 'appliedAt',
    label: 'Applied date',
    required: false,
    headers: ['applied', 'applied at', 'applied on', 'date applied', 'date'],
  },
  { id: 'notes', label: 'Notes', required: false, headers: ['notes', 'note', 'comments'] },
  { id: 'ats', label: 'ATS', required: false, headers: ['ats'] },
  { id: 'employer', label: 'Employer key', required: false, headers: ['employer key'] },
  { id: 'jobId', label: 'Job ID', required: false, headers: ['job id', 'jobid', 'req id', 'requisition id'] },
] as const;

export type ImportFieldId = (typeof IMPORT_FIELDS)[number]['id'];
/** Which column (by index) holds each field, or null when none does. */
export type ImportMapping = Readonly<Record<ImportFieldId, number | null>>;

export const EMPTY_MAPPING: ImportMapping = {
  company: null,
  url: null,
  title: null,
  location: null,
  country: null,
  status: null,
  appliedAt: null,
  notes: null,
  ats: null,
  employer: null,
  jobId: null,
};

/** Maps columns whose header reads like a field, so a file exported from here maps itself. */
export function guessMapping(headers: readonly string[]): ImportMapping {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  const mapping: Record<ImportFieldId, number | null> = { ...EMPTY_MAPPING };
  for (const field of IMPORT_FIELDS) {
    const index = normalized.findIndex((header) => field.headers.some((name) => name === header));
    mapping[field.id] = index === -1 ? null : index;
  }
  return mapping;
}

export interface RowNote {
  /** The row's line in the file: the header is row 1. */
  readonly row: number;
  readonly message: string;
}

export interface ImportPreview {
  readonly ready: readonly ImportedApplication[];
  /** Rows that won't be imported, and why. */
  readonly problems: readonly RowNote[];
  /** Rows that will be imported, with something you should know. */
  readonly warnings: readonly RowNote[];
}

/** Reads every data row (all but the first) with `mapping`. */
export function previewImport(
  rows: readonly (readonly string[])[],
  mapping: ImportMapping,
  now: Date,
): ImportPreview {
  const ready: ImportedApplication[] = [];
  const problems: RowNote[] = [];
  const warnings: RowNote[] = [];
  for (const [index, cells] of rows.slice(1).entries()) {
    const row = index + 2;
    const read = (field: ImportFieldId) => {
      const column = mapping[field];
      return column === null ? '' : (cells[column] ?? '').trim();
    };
    const result = readRow(read, now);
    if ('problem' in result) {
      problems.push({ row, message: result.problem });
      continue;
    }
    ready.push(result.application);
    for (const message of result.warnings) warnings.push({ row, message });
  }
  return { ready, problems, warnings };
}

type RowResult = { problem: string } | { application: ImportedApplication; warnings: string[] };

function readRow(read: (field: ImportFieldId) => string, now: Date): RowResult {
  const company = read('company');
  if (company === '') return { problem: 'No company.' };
  const url = postingUrl(read('url'));
  if (url === null) return { problem: 'No posting URL, or it isn’t a full link starting with https://.' };

  const status = read('status') === '' ? 'applied' : statusFrom(read('status'));
  if (status === null) {
    return { problem: 'Unknown Status. Use Applied, Interviewing, Offer, Rejected or Withdrawn.' };
  }
  const applied = appliedAtFrom(read('appliedAt'), now);
  if (applied === null)
    return { problem: 'The applied date isn’t a date employ-me can read. Use YYYY-MM-DD.' };

  const warnings: string[] = [];
  if (applied.assumed) warnings.push('No applied date: today’s date is used.');
  const countryText = read('country');
  const country = countryCodeFrom(countryText);
  if (countryText !== '' && country === null) warnings.push('Country not recognized: left empty.');

  const given = atsIdSchema.safeParse(read('ats'));
  const key =
    given.success && read('employer') !== '' && read('jobId') !== ''
      ? { ats: given.data, employer: read('employer').toLowerCase(), jobId: read('jobId') }
      : postingKeyFor(url, company);
  const title = read('title');
  const location = read('location');
  const candidate: Posting = {
    key,
    url: url.href,
    company,
    ...(title === '' ? {} : { title }),
    ...(location === '' ? {} : { location }),
    ...(country === null ? {} : { country }),
  };
  const posting = postingSchema.safeParse(candidate);
  if (!posting.success) return { problem: 'The posting details are too long or malformed.' };

  const notes = read('notes');
  return {
    application: { source: 'import', posting: posting.data, appliedAt: applied.value, status, notes },
    warnings,
  };
}

/**
 * ISO dates and date-times as written; other formats as the browser reads
 * them ("Oct 27, 2026"). A bare date is kept at noon UTC, so it shows as the
 * same day almost everywhere.
 */
export function appliedAtFrom(text: string, now: Date): { value: string; assumed: boolean } | null {
  if (text === '') return { value: now.toISOString(), assumed: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const ms = Date.parse(`${text}T12:00:00Z`);
    // Date.parse rolls 2026-02-31 over to March: only accept a date that reads back the same.
    if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== text) return null;
    return { value: new Date(ms).toISOString(), assumed: false };
  }
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : { value: new Date(ms).toISOString(), assumed: false };
}
