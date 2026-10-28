import type { ResumeExtract } from '@employ-me/core';
import { useState } from 'react';
import type { BackgroundError } from '../../../messaging/background';
import { callBackground } from '../../../messaging/background-client';
import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { useStoreQuery } from '../data/use-store-query';
import { AddResumeForm } from '../resumes/AddResumeForm';

const RESUMES: readonly Topic[] = ['resumes'];
const loadResumes = (store: DataStore) => store.listResumes();

/** Step 1: add a Resume, and have your Provider read it once (design.md "Setup"). */
export function ResumeStep({
  providerName,
  onRead,
  onSkip,
}: {
  readonly providerName: string;
  readonly onRead: (extract: ResumeExtract) => void;
  readonly onSkip: () => void;
}) {
  const resumes = useStoreQuery(RESUMES, loadResumes);
  const [chosen, setChosen] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [failure, setFailure] = useState<BackgroundError | null>(null);

  const list = resumes.result?.ok === true ? resumes.result.value : [];
  const selected = list.find((r) => r.id === chosen) ?? list.find((r) => r.isDefault) ?? null;

  const read = async () => {
    if (selected === null) return;
    setReading(true);
    setFailure(null);
    const result = await callBackground('helper.parseResume', { resumeId: selected.id });
    setReading(false);
    if (result.ok) onRead(result.value.extract);
    else setFailure(result.error);
  };

  return (
    <section className="card stack" data-testid="step-resume">
      <div>
        <h2>Start with your Resume</h2>
        <p className="card-intro">
          {providerName} reads it once and fills in what it can. You check every field next. Work
          Authorization, salary, screening and Self-ID Answers are never guessed from it: you answer those
          yourself.
        </p>
      </div>

      {list.length === 0 ? (
        <AddResumeForm submitLabel="Add Resume" />
      ) : (
        <>
          <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0, gap: 6 }}>
            <legend className="label" style={{ fontWeight: 500, marginBottom: 6 }}>
              Which Resume should be read?
            </legend>
            {list.map((resume) => (
              <label key={resume.id} className="check">
                <input
                  type="radio"
                  name="setup-resume"
                  checked={selected?.id === resume.id}
                  onChange={() => {
                    setChosen(resume.id);
                  }}
                />
                <span>
                  <strong>{resume.label}</strong> <span className="muted">· {resume.fileName}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <details>
            <summary>Add another Resume</summary>
            <div style={{ marginTop: 12 }}>
              <AddResumeForm
                offerDefault
                onAdded={(meta) => {
                  setChosen(meta.id);
                }}
              />
            </div>
          </details>
        </>
      )}

      {reading ? (
        <div className="notice notice-info" role="status" data-testid="reading-resume">
          Reading your Resume with {providerName}… This can take a minute.
        </div>
      ) : null}
      {failure === null ? null : failure.reason === 'resumeUnreadable' ? (
        // Retrying the same file can't help: a scan or a .doc has no text to read.
        <ErrorNotice error={failure} title="This Resume has no text employ-me can read.">
          <div className="stack" style={{ gap: 8, width: '100%' }} data-testid="add-readable-resume">
            <strong>Add a copy with selectable text</strong>
            <AddResumeForm
              offerDefault
              submitLabel="Add this copy"
              onAdded={(meta) => {
                setChosen(meta.id);
                setFailure(null);
              }}
            />
            <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={onSkip}>
              Fill in my Profile by hand
            </button>
          </div>
        </ErrorNotice>
      ) : (
        <ErrorNotice error={failure} title="Your Resume couldn’t be read.">
          <button type="button" className="btn" onClick={() => void read()}>
            Try again
          </button>
          <button type="button" className="btn" onClick={onSkip}>
            Fill in my Profile by hand
          </button>
        </ErrorNotice>
      )}

      <div className="row">
        <button type="button" className="link-button" onClick={onSkip}>
          Skip: I’ll fill in my Profile by hand
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary"
          disabled={selected === null || reading}
          onClick={() => void read()}
        >
          Read my Resume
        </button>
      </div>
    </section>
  );
}
