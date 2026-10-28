import type { SavedAnswer } from '@employ-me/core';
import { useState } from 'react';
import { TextAreaField } from '../controls/TextAreaField';
import { TextField } from '../controls/TextField';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';

interface OverrideRow {
  readonly key: number;
  readonly employer: string;
  readonly answer: string;
}

/** Edits one Saved Answer, or adds one when `saved` is absent. */
export function SavedAnswerEditor({
  saved,
  onDone,
}: {
  readonly saved?: SavedAnswer;
  readonly onDone: () => void;
}) {
  const store = useDataStore();
  const toast = useToast();
  const [question, setQuestion] = useState(saved?.question ?? '');
  const [answer, setAnswer] = useState(saved?.answer ?? '');
  const [overrides, setOverrides] = useState<readonly OverrideRow[]>(() =>
    Object.entries(saved?.employerOverrides ?? {}).map(([employer, text], key) => ({
      key,
      employer,
      answer: text,
    })),
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);

  const setRow = (key: number, patch: Partial<OverrideRow>) => {
    setOverrides((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    const employerOverrides = Object.fromEntries(
      overrides.filter((row) => row.employer.trim() !== '').map((row) => [row.employer, row.answer]),
    );
    setBusy(true);
    const result =
      saved === undefined
        ? await store.addSavedAnswer({ question, answer, employerOverrides })
        : await store.updateSavedAnswer(saved.id, { question, answer, employerOverrides });
    setBusy(false);
    if (!result.ok) {
      setErrors(Object.fromEntries((result.error.issues ?? []).map((issue) => [issue.path, issue.message])));
      if (result.error.issues === undefined) toast(result.error.message);
      return;
    }
    toast(saved === undefined ? 'Saved Answer added.' : 'Saved Answer updated.');
    onDone();
  };

  return (
    <div className="stack" style={{ gap: 12 }} data-testid="saved-answer-editor">
      <TextField
        label="Question"
        wide
        path="question"
        error={errors['question']}
        value={question}
        onChange={setQuestion}
      />
      <TextAreaField
        label="Your answer"
        wide
        path="answer"
        error={errors['answer']}
        rows={5}
        value={answer}
        onChange={setAnswer}
      />
      <div>
        <div className="label" style={{ fontWeight: 500, fontSize: 13 }}>
          Answers for specific companies
        </div>
        <p className="muted small" style={{ margin: '2px 0 8px' }}>
          Used instead of your answer on that company’s forms. Use the company’s name as it appears in its job
          links (acme in job-boards.greenhouse.io/acme).
        </p>
        {overrides.map((row) => (
          <div key={row.key} className="subcard" data-testid={`override-${String(row.key)}`}>
            <div className="grid">
              <TextField
                label="Company"
                path={`employerOverrides.${String(row.key)}.employer`}
                value={row.employer}
                onChange={(v) => {
                  setRow(row.key, { employer: v });
                }}
              />
              <TextAreaField
                label="Answer for this company"
                wide
                rows={3}
                path={`employerOverrides.${String(row.key)}.answer`}
                value={row.answer}
                onChange={(v) => {
                  setRow(row.key, { answer: v });
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-small btn-danger"
              style={{ marginTop: 8 }}
              onClick={() => {
                setOverrides((rows) => rows.filter((r) => r.key !== row.key));
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-small"
          style={{ marginTop: 8 }}
          onClick={() => {
            setOverrides((rows) => [
              ...rows,
              { key: Math.max(-1, ...rows.map((r) => r.key)) + 1, employer: '', answer: '' },
            ]);
          }}
        >
          Add an answer for a company
        </button>
      </div>
      <div className="row">
        <span className="spacer" />
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
