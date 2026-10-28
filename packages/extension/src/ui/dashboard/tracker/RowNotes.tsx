import type { RowNote } from '../../../tracker';

const SHOWN = 20;

/** Row-by-row notes from a CSV import: what won't be imported, and what to check. */
export function RowNotes({
  title,
  notes,
  testId,
}: {
  readonly title: string;
  readonly notes: readonly RowNote[];
  readonly testId: string;
}) {
  if (notes.length === 0) return null;
  return (
    <details open={notes.length <= 5} data-testid={testId}>
      <summary>
        {title} ({String(notes.length)})
      </summary>
      <ul className="small" style={{ margin: '6px 0 0' }}>
        {notes.slice(0, SHOWN).map((note, index) => (
          <li key={index}>
            Row {note.row}: {note.message}
          </li>
        ))}
        {notes.length > SHOWN ? <li>…and {notes.length - SHOWN} more.</li> : null}
      </ul>
    </details>
  );
}
