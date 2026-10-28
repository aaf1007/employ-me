import type { ResumeMeta } from '@employ-me/core';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../common/toast-context';
import { useDataStore } from '../data/store-context';
import { formatBytes, formatDate } from '../format';

export function ResumeRow({ resume }: { readonly resume: ResumeMeta }) {
  const store = useDataStore();
  const toast = useToast();
  const [href, setHref] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // A link to the stored file, so Download is a plain link you click.
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    void store.getResumeFile(resume.id).then((result) => {
      if (!live || !result.ok) return;
      url = URL.createObjectURL(result.value.file);
      setHref(url);
    });
    return () => {
      live = false;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [store, resume.id]);

  const rename = async (label: string) => {
    const result = await store.renameResume(resume.id, label);
    if (result.ok) {
      setRenaming(null);
      toast('Resume renamed.');
    } else {
      toast(result.error.issues?.[0]?.message ?? result.error.message);
    }
  };

  return (
    <li className="subcard" data-testid={`resume-${resume.label}`}>
      <div className="row">
        {renaming === null ? (
          <strong>{resume.label}</strong>
        ) : (
          <input
            className="input"
            style={{ width: 240 }}
            aria-label="New label"
            value={renaming}
            onChange={(event) => {
              setRenaming(event.target.value);
            }}
          />
        )}
        {resume.isDefault ? <span className="badge badge-applied">Default</span> : null}
        <span className="spacer" />
        {renaming === null ? (
          <>
            {resume.isDefault ? null : (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  void store.setDefaultResume(resume.id).then((r) => {
                    toast(r.ok ? `${resume.label} is now your default Resume.` : r.error.message);
                  });
                }}
              >
                Make default
              </button>
            )}
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setRenaming(resume.label);
              }}
            >
              Rename
            </button>
            {href === null ? null : (
              <a className="btn btn-small" href={href} download={resume.fileName}>
                Download
              </a>
            )}
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setRenaming(null);
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-small btn-primary" onClick={() => void rename(renaming)}>
              Save
            </button>
          </>
        )}
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        {resume.fileName} · {formatBytes(resume.sizeBytes)} · added {formatDate(resume.addedAt)}
      </div>
      {confirming ? (
        <ConfirmDialog
          title={`Delete “${resume.label}”?`}
          confirmLabel="Delete Resume"
          danger
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            void store.deleteResume(resume.id).then((r) => {
              toast(r.ok ? 'Resume deleted.' : r.error.message);
            });
          }}
        >
          <p>
            The file is removed from employ-me. Applications you sent with it keep its name in their Snapshot.
            {resume.isDefault ? ' Your newest other Resume becomes the default.' : ''}
          </p>
        </ConfirmDialog>
      ) : null}
    </li>
  );
}
