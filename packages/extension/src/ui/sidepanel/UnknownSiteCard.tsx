import type { PanelController } from '../../sidepanel/controller';
import type { PanelState } from '../../sidepanel/state';
import { AppliedWarning } from './AppliedWarning';

/**
 * A site employ-me has no content script for (the generic fallback,
 * design.md "Job sites"): nothing has read the page yet, and Fill is what
 * lets it.
 */
export function UnknownSiteCard({
  state,
  controller,
}: {
  readonly state: PanelState;
  readonly controller: PanelController;
}) {
  const host = hostOf(state.pageUrl);
  const reading = state.fill === 'filling';
  return (
    <div className="card" data-testid="unknown-site">
      <h2 className="small" data-testid="unknown-site-host">
        {host ?? 'This site'}
      </h2>
      <p>employ-me doesn’t know this job site.</p>
      <p className="small muted">
        Click Fill and it reads this page, fills the fields it recognises and lists what it couldn’t fill.
        Nothing reads the page before you click.
      </p>
      <AppliedWarning applied={state.applied} />
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={reading}
          onClick={() => void controller.fillThisSite()}
        >
          Fill
        </button>
        {reading ? <span className="muted">Reading this page…</span> : null}
      </div>
    </div>
  );
}

function hostOf(href: string | null): string | null {
  if (href === null || !/^https?:\/\//.test(href)) return null;
  return new URL(href).hostname.replace(/^www\./, '');
}
