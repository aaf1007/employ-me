import type { PanelController } from '../../sidepanel/controller';
import type { PanelState } from '../../sidepanel/state';

/**
 * Part of a company site's page comes from another site employ-me may not
 * read yet. Allowing it is a click of its own, because Chrome asks only
 * during one, and it is for that site only.
 */
export function FrameAccessCard({
  state,
  controller,
}: {
  readonly state: PanelState;
  readonly controller: PanelController;
}) {
  const { unreachable, fill } = state;
  if (unreachable.length === 0) return null;
  const sites = unreachable.map((origin) => new URL(origin).hostname);
  return (
    <div className="warning" role="status" data-testid="frame-access">
      <strong>Part of this page comes from {sites.join(', ')}.</strong>
      <p className="small">
        employ-me can’t read it yet, and found no Application Form in the rest of the page. If the form is in
        it, allow {sites.length === 1 ? 'that site' : 'those sites'}: Chrome asks you once.
      </p>
      <div className="row" style={{ marginTop: 6 }}>
        <button
          type="button"
          disabled={fill === 'filling' || fill === 'asking'}
          onClick={() => void controller.allowFrames()}
        >
          Allow {sites.join(', ')} and Fill
        </button>
      </div>
    </div>
  );
}
