import type { AtsId } from '@employ-me/core';
import type { PanelController } from '../../sidepanel/controller';
import type { PanelState } from '../../sidepanel/state';
import { AppliedWarning } from './AppliedWarning';

const ATS_NAMES = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  generic: 'Company site',
} as const satisfies Readonly<Record<AtsId, string>>;

/** The Posting, the already-applied warning, and the Resume for this Application. */
export function PostingHeader({
  state,
  controller,
}: {
  readonly state: PanelState;
  readonly controller: PanelController;
}) {
  const { posting, detected, applied, resumes, resumeId } = state;
  if (detected === null) return null;
  return (
    <div className="posting" data-testid="posting">
      <h2 data-testid="posting-title">{posting?.title ?? 'Application Form'}</h2>
      <p className="muted small">
        {[posting?.company, posting?.location, ATS_NAMES[detected.ats]].filter(Boolean).join(' · ')}
      </p>
      <AppliedWarning applied={applied} />
      {resumes.length === 0 ? (
        <p className="small muted" style={{ marginTop: 8 }} data-testid="no-resume">
          No Resume yet. Add one in the dashboard to attach it.
        </p>
      ) : (
        <label className="row small" style={{ marginTop: 8 }}>
          Resume for this Application
          <select
            data-testid="resume-picker"
            value={resumeId ?? ''}
            disabled={state.fill === 'filling' || state.fill === 'asking'}
            onChange={(event) => {
              controller.selectResume(event.target.value);
            }}
          >
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.label}
                {resume.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
