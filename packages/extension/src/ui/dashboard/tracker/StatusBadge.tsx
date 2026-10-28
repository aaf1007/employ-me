import type { Status } from '@employ-me/core';
import { STATUS_LABELS } from '../../../tracker';

export function StatusBadge({ status }: { readonly status: Status }) {
  return (
    <span className={`badge badge-${status}`} data-testid="status-badge">
      {STATUS_LABELS[status]}
    </span>
  );
}
