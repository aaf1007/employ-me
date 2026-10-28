import type { PanelController } from '../../sidepanel/controller';
import type { SubmissionState } from '../../sidepanel/state';

/**
 * After you submit (design.md "Tracking"): the Application the job site's
 * confirmation created, or "Did you apply?" when you left a filled form
 * without one.
 */
export function SubmissionNotice({
  submission,
  controller,
  openTracker,
}: {
  readonly submission: SubmissionState;
  readonly controller: PanelController;
  readonly openTracker: () => void;
}) {
  switch (submission.state) {
    case 'none':
    case 'declined':
      return null;
    case 'askDidYouApply':
      return (
        <div className="warning" role="alertdialog" aria-label="Did you apply?" data-testid="did-you-apply">
          <strong>Did you apply?</strong>
          <p className="small">
            You left a filled Application Form, and the job site didn’t confirm a submission.
          </p>
          <div className="row" style={{ marginTop: 6 }}>
            <button type="button" onClick={() => void controller.answerDidYouApply(true)}>
              Yes, I applied
            </button>
            <button type="button" onClick={() => void controller.answerDidYouApply(false)}>
              No
            </button>
          </div>
        </div>
      );
    case 'recording':
      return <p className="muted">Recording your Application…</p>;
    case 'recorded':
      return (
        <div className="success" role="status" data-testid="application-recorded">
          <strong>Application recorded in your Tracker</strong>
          <p className="small">
            {submission.application.source === 'confirmation'
              ? 'The job site confirmed your submission.'
              : 'You said you applied.'}{' '}
            Its Snapshot keeps the job description, your answers and your Resume.
          </p>
          <div className="row">
            <button type="button" onClick={openTracker}>
              Open the Tracker
            </button>
          </div>
        </div>
      );
  }
}
