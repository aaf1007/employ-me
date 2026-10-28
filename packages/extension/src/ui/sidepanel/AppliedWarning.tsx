import type { ApplicationSummary } from '../../storage';
import { STATUS_LABELS } from '../../tracker';
import { formatDate } from '../dashboard/format';

/** The already-applied warning: same job site, employer and job id (design.md "Tracking"). */
export function AppliedWarning({ applied }: { readonly applied: readonly ApplicationSummary[] }) {
  if (applied.length === 0) return null;
  return (
    <div className="warning" role="status" data-testid="already-applied" style={{ marginTop: 8 }}>
      <strong>You already applied to this Posting.</strong>
      {applied.map((application) => (
        <p key={application.id} className="small">
          {formatDate(application.appliedAt)} · {STATUS_LABELS[application.status]}
        </p>
      ))}
    </div>
  );
}
