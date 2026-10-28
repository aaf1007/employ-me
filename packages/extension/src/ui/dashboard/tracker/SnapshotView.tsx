import type { Snapshot, SubmittedAnswer } from '@employ-me/core';
import { formatDate } from '../format';
import { descriptionText } from './description-text';

/** What you sent: the Posting's description, your answers and the Resume (glossary "Snapshot"). */
export function SnapshotView({ snapshot }: { readonly snapshot: Snapshot }) {
  return (
    <div className="stack" style={{ gap: 12 }} data-testid="snapshot">
      <p className="muted small" style={{ margin: 0 }}>
        Kept {formatDate(snapshot.capturedAt)}. It stays on this computer.
      </p>
      <div>
        <h3 className="small muted" style={{ margin: '0 0 4px' }}>
          Resume you sent
        </h3>
        {snapshot.resume === null ? (
          <span className="muted">No Resume</span>
        ) : (
          <span data-testid="snapshot-resume">
            {snapshot.resume.label} <span className="muted">· {snapshot.resume.fileName}</span>
          </span>
        )}
      </div>
      <div>
        <h3 className="small muted" style={{ margin: '0 0 4px' }}>
          Your answers
        </h3>
        {snapshot.answers.length === 0 ? (
          <span className="muted">No answers were recorded.</span>
        ) : (
          <dl className="kv" data-testid="snapshot-answers">
            {snapshot.answers.map((answer, index) => (
              <div key={index} style={{ display: 'contents' }}>
                <dt>{answer.label}</dt>
                <dd>{shown(answer.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div>
        <h3 className="small muted" style={{ margin: '0 0 4px' }}>
          Job description
        </h3>
        {snapshot.postingDescription.trim() === '' ? (
          <span className="muted">Not available.</span>
        ) : (
          <pre className="prose" data-testid="snapshot-description">
            {descriptionText(snapshot.postingDescription)}
          </pre>
        )}
      </div>
    </div>
  );
}

function shown(value: SubmittedAnswer['value']): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return value;
}
