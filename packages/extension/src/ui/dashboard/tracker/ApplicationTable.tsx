import type { ApplicationSummary } from '../../../storage';
import { formatDate } from '../format';
import { companyOf } from './filter';
import { StatusBadge } from './StatusBadge';

export function ApplicationTable({
  applications,
  selected,
  onSelect,
}: {
  readonly applications: readonly ApplicationSummary[];
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <table className="table" data-testid="application-table">
      <thead>
        <tr>
          <th>Company</th>
          <th>Title</th>
          <th>Status</th>
          <th>Applied</th>
        </tr>
      </thead>
      <tbody>
        {applications.map((application) => (
          <tr
            key={application.id}
            aria-selected={application.id === selected}
            tabIndex={0}
            data-testid="application-row"
            onClick={() => {
              onSelect(application.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(application.id);
              }
            }}
          >
            <td>
              <strong>{companyOf(application)}</strong>
              {application.posting.location === undefined ? null : (
                <div className="muted small">{application.posting.location}</div>
              )}
            </td>
            <td>
              {application.posting.title ?? <span className="muted">(no title)</span>}
              {application.hasSnapshot ? (
                <div className="muted small" title="Has a Snapshot of what you sent">
                  Snapshot
                </div>
              ) : null}
            </td>
            <td>
              <StatusBadge status={application.status} />
            </td>
            <td className="muted">{formatDate(application.appliedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
