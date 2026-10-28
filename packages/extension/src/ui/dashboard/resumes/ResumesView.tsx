import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { PageHeader } from '../common/PageHeader';
import { useToast } from '../common/toast-context';
import { useStoreQuery } from '../data/use-store-query';
import { AddResumeForm } from './AddResumeForm';
import { ResumeRow } from './ResumeRow';

const RESUMES: readonly Topic[] = ['resumes'];
const loadResumes = (store: DataStore) => store.listResumes();

export function ResumesView() {
  const resumes = useStoreQuery(RESUMES, loadResumes);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Resumes"
        intro="Keep a Resume for each kind of role. A Fill uses your default unless you pick another for that Application."
      />
      <div className="stack">
        <section className="card">
          <h2>Add a Resume</h2>
          <AddResumeForm
            offerDefault={resumes.result?.ok === true && resumes.result.value.length > 0}
            onAdded={(meta) => {
              toast(`Added ${meta.label}.`);
            }}
          />
        </section>
        <section className="card">
          <h2>Your Resumes</h2>
          {resumes.result === null ? (
            <p className="muted">Loading…</p>
          ) : !resumes.result.ok ? (
            <ErrorNotice error={resumes.result.error} />
          ) : resumes.result.value.length === 0 ? (
            <p className="empty">No Resumes yet.</p>
          ) : (
            <ul
              className="stack"
              style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}
              data-testid="resume-list"
            >
              {[...resumes.result.value].reverse().map((resume) => (
                <ResumeRow key={resume.id} resume={resume} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
