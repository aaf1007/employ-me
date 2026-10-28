import { useId, useMemo, useState } from 'react';
import {
  EMPTY_MAPPING,
  guessMapping,
  IMPORT_FIELDS,
  parseCsv,
  previewImport,
  type ImportMapping,
} from '../../../tracker';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';
import { plural } from '../format';
import { RowNotes } from './RowNotes';

interface LoadedFile {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
  /** Rows without an applied date get this date. */
  readonly readAt: Date;
}

/** Imports Applications from a CSV, with the columns you map. They have no Snapshot. */
export function CsvImport({ onDone }: { readonly onDone: () => void }) {
  const store = useDataStore();
  const toast = useToast();
  const id = useId();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(EMPTY_MAPPING);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(
    () => (file === null ? null : previewImport(file.rows, mapping, file.readAt)),
    [file, mapping],
  );
  const headers = file?.rows[0] ?? [];
  const sample = file?.rows[1] ?? [];
  const missing = IMPORT_FIELDS.filter((field) => field.required && mapping[field.id] === null);

  const choose = async (picked: File) => {
    const parsed = parseCsv(await picked.text());
    if (!parsed.ok) {
      setFile(null);
      setProblem(`${parsed.error.message}. Check that it is a CSV file.`);
      return;
    }
    if (parsed.value.length < 2) {
      setFile(null);
      setProblem('The file has a header row but no Applications.');
      return;
    }
    setProblem(null);
    setFile({ name: picked.name, rows: parsed.value, readAt: new Date() });
    setMapping(guessMapping(parsed.value[0] ?? []));
  };

  const run = async () => {
    if (preview === null) return;
    setBusy(true);
    const result = await store.importApplications(preview.ready);
    setBusy(false);
    if (!result.ok) {
      toast(result.error.message);
      return;
    }
    const { added, duplicates } = result.value;
    toast(
      `Imported ${plural(added, 'Application')}.` +
        (duplicates.length === 0
          ? ''
          : ` ${plural(duplicates.length, 'was', 'were')} already in your Tracker.`),
    );
    onDone();
  };

  return (
    <section className="card stack" style={{ gap: 14 }} data-testid="csv-import">
      <div>
        <h2>Import Applications from CSV</h2>
        <p className="card-intro">
          A header row, then one Application per row. You say which column is which. Imported Applications
          have no Snapshot, and ones already in your Tracker are skipped.
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-file`}>CSV file</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,text/csv"
          data-testid="csv-file"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked !== undefined) void choose(picked);
          }}
        />
        {problem === null ? null : <span className="field-error">{problem}</span>}
      </div>

      {file === null || preview === null ? null : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {plural(file.rows.length - 1, 'row')} in {file.name}.
          </p>
          <div className="grid" data-testid="csv-mapping">
            {IMPORT_FIELDS.map((field) => (
              <div
                key={field.id}
                className="field"
                data-invalid={field.required && mapping[field.id] === null}
              >
                <label htmlFor={`${id}-${field.id}`}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
                <select
                  id={`${id}-${field.id}`}
                  data-testid={`map-${field.id}`}
                  value={mapping[field.id] === null ? '' : String(mapping[field.id])}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMapping({ ...mapping, [field.id]: value === '' ? null : Number(value) });
                  }}
                >
                  <option value="">Not in this file</option>
                  {headers.map((header, index) => (
                    <option key={index} value={String(index)}>
                      {header === '' ? `Column ${String(index + 1)}` : header}
                      {sample[index] === undefined || sample[index] === ''
                        ? ''
                        : ` (e.g. ${truncate(sample[index])})`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {missing.length > 0 ? (
            <div className="notice notice-warn">
              Choose the columns for {missing.map((f) => f.label).join(' and ')}.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }} data-testid="csv-preview">
              <div className={preview.ready.length > 0 ? 'notice notice-ok' : 'notice notice-warn'}>
                <strong data-testid="csv-ready">
                  {plural(preview.ready.length, 'Application')} ready to import
                </strong>
                {preview.problems.length === 0 ? null : (
                  <p>{plural(preview.problems.length, 'row')} can’t be imported.</p>
                )}
              </div>
              <RowNotes title="Not imported" notes={preview.problems} testId="csv-problems" />
              <RowNotes title="Imported, but check" notes={preview.warnings} testId="csv-warnings" />
            </div>
          )}
        </>
      )}

      <div className="row">
        <span className="spacer" />
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || preview === null || missing.length > 0 || preview.ready.length === 0}
          onClick={() => void run()}
        >
          {preview === null ? 'Import' : `Import ${plural(preview.ready.length, 'Application')}`}
        </button>
      </div>
    </section>
  );
}

function truncate(text: string): string {
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}
