import type { PanelController } from '../../sidepanel/controller';

/**
 * No Application Form on this page. On a Posting's description page whose
 * form is at another address, Open application form points the tab there:
 * it navigates, and never clicks the page's Apply button (design.md
 * "Starting a Fill").
 */
export function NoFormCard({
  formUrl,
  controller,
}: {
  readonly formUrl: string | null;
  readonly controller: PanelController;
}) {
  return (
    <div className="card" data-testid="no-form">
      {formUrl === null ? (
        <>
          <p>There’s no Application Form on this page.</p>
          <p className="small muted">Open the Posting’s Application Form, then look again.</p>
        </>
      ) : (
        <>
          <p>This is the Posting. Its Application Form is on another page.</p>
          <p className="small muted">
            Open it here, then click Fill. employ-me goes to the form’s address; it doesn’t click Apply.
          </p>
        </>
      )}
      <div className="row">
        {formUrl === null ? null : (
          <button
            type="button"
            className="primary"
            data-testid="open-form"
            onClick={() => void controller.openApplicationForm()}
          >
            Open application form
          </button>
        )}
        <button type="button" onClick={() => void controller.detect()}>
          Look again
        </button>
      </div>
    </div>
  );
}
