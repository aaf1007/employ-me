import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('CSV', () => {
  it('round-trips commas, quotes, line breaks and empty cells', () => {
    const rows = [
      ['Company', 'Notes'],
      ['Acme, Inc.', 'Said "call me"\nnext week'],
      ['Initech', ''],
    ];
    expect(parseCsv(toCsv(rows))).toEqual({ ok: true, value: rows });
  });

  it('guards cells a spreadsheet would run as formulas, and restores them on import', () => {
    const rows = [
      ['=HYPERLINK("https://evil.example")', '+1 555', '-x', '@SUM(A1)', "'=already quoted", "'plain"],
    ];
    const csv = toCsv(rows);
    expect(
      csv.startsWith(
        `"'=HYPERLINK(""https://evil.example"")",'+1 555,'-x,'@SUM(A1),''=already quoted,'plain`,
      ),
    ).toBe(true);
    expect(parseCsv(csv)).toEqual({ ok: true, value: rows });
  });

  it('reads files from spreadsheets: a byte-order mark, LF or CR line breaks, blank lines', () => {
    expect(parseCsv('\uFEFFa,b\n1,2\r\n\r\n3,4\r5,6')).toEqual({
      ok: true,
      value: [
        ['a', 'b'],
        ['1', '2'],
        ['3', '4'],
        ['5', '6'],
      ],
    });
  });

  it('reports an unclosed quote and an empty file', () => {
    expect(parseCsv('a,"b\n1,2')).toMatchObject({ ok: false, error: { reason: 'unclosedQuote' } });
    expect(parseCsv('\n\n')).toMatchObject({ ok: false, error: { reason: 'empty' } });
  });
});
