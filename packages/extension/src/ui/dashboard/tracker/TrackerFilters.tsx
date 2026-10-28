import { STATUSES, type Status } from '@employ-me/core';
import { STATUS_LABELS } from '../../../tracker';
import type { TrackerFilter } from './filter';

export function TrackerFilters({
  filter,
  onChange,
  counts,
  total,
  companies,
}: {
  readonly filter: TrackerFilter;
  readonly onChange: (filter: TrackerFilter) => void;
  readonly counts: Readonly<Record<Status, number>>;
  readonly total: number;
  readonly companies: readonly string[];
}) {
  return (
    <div className="stack" style={{ gap: 10 }} data-testid="tracker-filters">
      <div className="row">
        <input
          className="input"
          type="search"
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Search company, title, location or notes"
          aria-label="Search Applications"
          value={filter.search}
          onChange={(event) => {
            onChange({ ...filter, search: event.target.value });
          }}
        />
        <select
          className="input"
          style={{ width: 'auto' }}
          aria-label="Company"
          data-testid="company-filter"
          value={filter.company ?? ''}
          onChange={(event) => {
            onChange({ ...filter, company: event.target.value === '' ? null : event.target.value });
          }}
        >
          <option value="">All companies</option>
          {companies.map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </select>
      </div>
      <div className="chips" role="group" aria-label="Status">
        <button
          type="button"
          className="chip"
          aria-pressed={filter.status === 'all'}
          onClick={() => {
            onChange({ ...filter, status: 'all' });
          }}
        >
          All {total}
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="chip"
            aria-pressed={filter.status === status}
            data-testid={`status-filter-${status}`}
            onClick={() => {
              onChange({ ...filter, status });
            }}
          >
            {STATUS_LABELS[status]} {counts[status]}
          </button>
        ))}
      </div>
    </div>
  );
}
