import { err, ok, type Result } from '@employ-me/core';

// RFC 4180 CSV. Cells are quoted when they need it; line breaks are CRLF.
//
// Posting titles and company names come from job sites, so a cell could be a
// spreadsheet formula ("=HYPERLINK(...)"). On export, a cell that starts like
// a formula (after any apostrophes) gets one more leading apostrophe, which
// spreadsheets show as text. Import removes exactly one, so a round trip is
// exact.

const GUARDED = /^'*[=+\-@\t\r]/;
const UNGUARD = /^'+[=+\-@\t\r]/;

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

function cell(value: string): string {
  const safe = GUARDED.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export interface CsvError {
  readonly reason: 'unclosedQuote' | 'empty';
  readonly message: string;
}

/** Rows of cells. Blank lines are skipped; a byte-order mark is ignored. */
export function parseCsv(text: string): Result<string[][], CsvError> {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const input = text.startsWith('\uFEFF') ? text.slice(1) : text;

  const endCell = () => {
    row.push(UNGUARD.test(value) ? value.slice(1) : value);
    value = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index++) {
    const char = input.charAt(index);
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"' && value === '') {
      quoted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++;
      endRow();
    } else {
      value += char;
    }
  }
  if (quoted) return err({ reason: 'unclosedQuote', message: 'A quoted cell is never closed' });
  if (value !== '' || row.length > 0) endRow();
  if (rows.length === 0) return err({ reason: 'empty', message: 'The file has no rows' });
  return ok(rows);
}
