import { useMemo } from 'react';
import type { ApplicationSummary } from '../../../storage';
import { applicationsToCsv } from '../../../tracker';

const FILE_NAME = 'employ-me-applications.csv';

/**
 * Every Application as CSV. A plain link the browser downloads, so nothing
 * clicks it for you; it is rebuilt as the Tracker changes.
 */
export function CsvExportLink({ applications }: { readonly applications: readonly ApplicationSummary[] }) {
  const href = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(applicationsToCsv(applications))}`,
    [applications],
  );
  if (applications.length === 0) {
    return (
      <button type="button" className="btn" disabled>
        Export CSV
      </button>
    );
  }
  return (
    <a className="btn" href={href} download={FILE_NAME} data-testid="csv-export">
      Export CSV
    </a>
  );
}
