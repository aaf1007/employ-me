import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { PanelController } from '../../sidepanel/controller';

type Copy =
  | { readonly state: 'idle' }
  | { readonly state: 'copied' }
  | { readonly state: 'failed'; readonly report: string };

/** "Copy debug report": what the Fill saw and decided, with every value stripped. */
export function DebugReportButton({ controller }: { readonly controller: PanelController }) {
  const [copy, setCopy] = useState<Copy>({ state: 'idle' });
  const onCopy = async () => {
    const report = controller.debugReport(browser.runtime.getManifest().version);
    try {
      await navigator.clipboard.writeText(report);
      setCopy({ state: 'copied' });
    } catch (error) {
      // The clipboard can refuse (no focus); show it to copy by hand instead.
      if (!(error instanceof Error)) throw error;
      setCopy({ state: 'failed', report });
    }
  };
  return (
    <div className="row small">
      <button type="button" onClick={() => void onCopy()}>
        Copy debug report
      </button>
      {copy.state === 'copied' ? (
        <span className="muted" data-testid="debug-copied">
          Copied. Your values were left out.
        </span>
      ) : null}
      {copy.state === 'failed' ? (
        <textarea readOnly aria-label="Debug report" data-testid="debug-report" value={copy.report} />
      ) : null}
    </div>
  );
}
