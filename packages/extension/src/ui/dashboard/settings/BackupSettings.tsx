import { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import { BACKUP_FORMAT, backupFileName, type DataError } from '../../../storage';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ErrorNotice } from '../common/ErrorNotice';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';
import { formatBytes, formatDate, plural } from '../format';

interface Prepared {
  readonly href: string;
  readonly name: string;
  readonly size: number;
}

/** Just enough of a backup to say what it holds before you restore it; importBackup checks all of it. */
const summarySchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  exportedAt: z.string(),
  resumes: z.array(z.unknown()),
  savedAnswers: z.array(z.unknown()),
  applications: z.array(z.unknown()),
});

interface Pending {
  readonly file: unknown;
  readonly summary: z.infer<typeof summarySchema>;
}

/** Everything employ-me keeps, Resume files included, as one JSON file (design.md "Your data stays on your machine"). */
export function BackupSettings() {
  const store = useDataStore();
  const toast = useToast();
  const id = useId();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<DataError | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(
    () => () => {
      if (prepared !== null) URL.revokeObjectURL(prepared.href);
    },
    [prepared],
  );

  const prepare = async () => {
    setPreparing(true);
    const backup = await store.exportBackup();
    setPreparing(false);
    if (!backup.ok) {
      setProblem(backup.error);
      return;
    }
    const blob = new Blob([JSON.stringify(backup.value, null, 2)], { type: 'application/json' });
    setPrepared({
      href: URL.createObjectURL(blob),
      name: backupFileName(backup.value.exportedAt),
      size: blob.size,
    });
  };

  const choose = async (file: File) => {
    setProblem(null);
    setInputKey((k) => k + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setProblem({
        reason: 'invalidInput',
        message: 'That file isn’t JSON.',
        fix: 'Choose a backup exported from employ-me Settings.',
      });
      return;
    }
    const summary = summarySchema.safeParse(parsed);
    if (!summary.success) {
      setProblem({
        reason: 'invalidInput',
        message: 'That file isn’t an employ-me backup.',
        fix: 'Choose a backup exported from employ-me Settings.',
      });
      return;
    }
    setPending({ file: parsed, summary: summary.data });
  };

  const restore = async (file: unknown) => {
    setPending(null);
    const result = await store.importBackup(file);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    const { applications, savedAnswers, resumes } = result.value;
    toast(
      `Backup restored: ${plural(applications, 'Application')}, ${plural(savedAnswers, 'Saved Answer')}, ${plural(resumes, 'Resume')}.`,
    );
  };

  return (
    <section className="card stack" style={{ gap: 14 }} data-testid="backup-settings">
      <div>
        <h2>Backup</h2>
        <p className="card-intro">
          Your Profile, Resumes, Saved Answers, Applications with their Snapshots, and Settings, as one JSON
          file. It includes your Self-ID Answers: keep it somewhere private.
        </p>
      </div>
      {problem === null ? null : <ErrorNotice error={problem} title="That didn’t work." />}
      <div className="row">
        <button type="button" className="btn" disabled={preparing} onClick={() => void prepare()}>
          {preparing ? 'Preparing…' : prepared === null ? 'Export everything' : 'Export again'}
        </button>
        {prepared === null ? null : (
          <a
            className="btn btn-primary"
            href={prepared.href}
            download={prepared.name}
            data-testid="backup-download"
          >
            Download {prepared.name} ({formatBytes(prepared.size)})
          </a>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-file`}>Restore a backup</label>
        <input
          key={inputKey}
          id={`${id}-file`}
          type="file"
          accept=".json,application/json"
          data-testid="backup-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void choose(file);
          }}
        />
        <span className="field-hint">Restoring replaces everything employ-me has now.</span>
      </div>
      {pending === null ? null : (
        <ConfirmDialog
          title="Replace everything with this backup?"
          confirmLabel="Restore backup"
          danger
          onCancel={() => {
            setPending(null);
          }}
          onConfirm={() => void restore(pending.file)}
        >
          <p>
            The backup is from {formatDate(pending.summary.exportedAt)}:{' '}
            {plural(pending.summary.applications.length, 'Application')},{' '}
            {plural(pending.summary.savedAnswers.length, 'Saved Answer')} and{' '}
            {plural(pending.summary.resumes.length, 'Resume')}.
          </p>
          <p>
            Everything employ-me has now is replaced by it. Export a backup first if you might want it back.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
