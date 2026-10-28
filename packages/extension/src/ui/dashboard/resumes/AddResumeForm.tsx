import type { ResumeMeta } from '@employ-me/core';
import { useId, useState } from 'react';
import type { DataError } from '../../../storage';
import { CheckboxField } from '../controls/CheckboxField';
import { useDataStore } from '../data/store-context';

const ACCEPT =
  '.pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain';

/** Adds one labelled Resume. The label defaults to the file's name. */
export function AddResumeForm({
  onAdded,
  offerDefault = false,
  submitLabel = 'Add Resume',
}: {
  readonly onAdded?: (meta: ResumeMeta) => void;
  /** Show "Make this my default" (pointless for the first Resume, which always is). */
  readonly offerDefault?: boolean;
  readonly submitLabel?: string;
}) {
  const store = useDataStore();
  const id = useId();
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);
  // Remounting the file input is how it is cleared: assigning its value is a DOM write.
  const [inputKey, setInputKey] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (file === null) {
      setProblem('Choose a file first.');
      return;
    }
    setBusy(true);
    const result = await store.addResume({
      label: label.trim() === '' ? file.name.replace(/\.[^.]+$/, '') : label,
      fileName: file.name,
      file,
      makeDefault,
    });
    setBusy(false);
    if (!result.ok) {
      setProblem(describe(result.error));
      return;
    }
    setProblem(null);
    setLabel('');
    setFile(null);
    setMakeDefault(false);
    setInputKey((k) => k + 1);
    onAdded?.(result.value);
  };

  return (
    <div className="stack" style={{ gap: 12 }} data-testid="add-resume">
      <div className="grid">
        <div className="field" data-invalid={problem !== null}>
          <label htmlFor={`${id}-file`}>Resume file</label>
          <input
            key={inputKey}
            id={`${id}-file`}
            type="file"
            accept={ACCEPT}
            data-testid="resume-file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setProblem(null);
            }}
          />
          <span className={problem === null ? 'field-hint' : 'field-error'} data-testid="resume-file-help">
            {problem ?? 'PDF, Word or plain text, up to 10 MB.'}
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-label`}>Label</label>
          <input
            id={`${id}-label`}
            value={label}
            placeholder={file === null ? 'Backend, New grad…' : file.name.replace(/\.[^.]+$/, '')}
            data-testid="resume-label"
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
        </div>
      </div>
      <div className="row">
        {offerDefault ? (
          <CheckboxField
            label="Make this my default Resume"
            checked={makeDefault}
            onChange={setMakeDefault}
          />
        ) : null}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || file === null}
          onClick={() => void add()}
        >
          {busy ? 'Adding…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

function describe(error: DataError): string {
  return error.issues?.[0]?.message ?? `${error.message}. ${error.fix}`;
}
