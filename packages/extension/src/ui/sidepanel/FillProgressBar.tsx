import { useId } from 'react';
import type { FieldView } from '../../messaging/content';
import { fillProgress } from '../../sidepanel/progress';

/** "Filled 18 of 22 (82%)" over the Fill's results, as each outcome arrives (design.md "What you see"). */
export function FillProgressBar({ fields }: { readonly fields: readonly FieldView[] }) {
  const id = useId();
  const { filled, total, percent, required } = fillProgress(fields);
  const text = `Filled ${filled} of ${total} (${percent}%)`;
  return (
    <div className="progress" data-testid="fill-progress">
      <p className="small" id={id} data-testid="fill-progress-text">
        {text}
      </p>
      <div
        className="progress-track"
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={filled}
        aria-valuetext={text}
      >
        <div className="progress-value" style={{ width: `${percent}%` }} />
      </div>
      {required === null ? null : (
        <p className="small muted" data-testid="fill-progress-required">
          Required: {required.filled} of {required.total}
        </p>
      )}
    </div>
  );
}
