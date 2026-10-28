import { useEffect, useState, useSyncExternalStore } from 'react';
import { browser } from 'wxt/browser';
import { callBackground } from '../../messaging/background-client';
import { fetchPublicPosting } from '../../net/ats-public-api';
import { PanelController } from '../../sidepanel/controller';
import { tabLink } from '../../sidepanel/tab-link';
import { DebugReportButton } from './DebugReportButton';
import { FrameAccessCard } from './FrameAccessCard';
import { OutcomeGroups } from './OutcomeGroups';
import { PostingHeader } from './PostingHeader';
import { SubmissionNotice } from './SubmissionNotice';
import { UnknownSiteCard } from './UnknownSiteCard';

const openDashboard = (route: string) => {
  void browser.tabs.create({ url: browser.runtime.getURL(`/dashboard.html#${route}`) });
};

/** The side panel for one tab: detect, Fill, review, and the Application once you submit. */
export function FillPanel({ tabId }: { readonly tabId: number }) {
  const [controller] = useState(
    () =>
      new PanelController({
        tab: tabLink(tabId),
        call: callBackground,
        fetchPosting: fetchPublicPosting,
        now: () => new Date(),
      }),
  );
  useEffect(() => {
    controller.start();
    return () => {
      controller.dispose();
    };
  }, [controller]);
  const state = useSyncExternalStore(controller.store.subscribe, controller.store.get);
  const { phase, fill, provider, notice } = state;
  const busy = fill === 'filling' || fill === 'asking';

  return (
    <>
      {phase === 'detecting' ? (
        <p className="muted" data-testid="detecting">
          Looking for an Application Form…
        </p>
      ) : null}
      {phase === 'unknownSite' ? <UnknownSiteCard state={state} controller={controller} /> : null}
      {phase === 'noForm' ? (
        <div className="card" data-testid="no-form">
          <p>There’s no Application Form on this page.</p>
          <p className="small muted">Open the job’s application page, then look again.</p>
          <div className="row">
            <button type="button" onClick={() => void controller.detect()}>
              Look again
            </button>
          </div>
        </div>
      ) : null}
      {phase === 'ready' ? <PostingHeader state={state} controller={controller} /> : null}
      {phase === 'noForm' ? <FrameAccessCard state={state} controller={controller} /> : null}
      <SubmissionNotice
        submission={state.submission}
        controller={controller}
        openTracker={() => {
          openDashboard('tracker');
        }}
      />
      {notice === null ? null : (
        <div className="error" role="alert" data-testid="panel-notice">
          <strong>{notice.message}</strong>
          <p className="small">{notice.fix}</p>
        </div>
      )}
      {phase === 'ready' ? (
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy || state.submission.state === 'recorded'}
            onClick={() => void controller.fill()}
          >
            {state.view === null ? 'Fill' : 'Fill again'}
          </button>
          {fill === 'filling' ? <span className="muted">Filling…</span> : null}
          {fill === 'asking' ? <span className="muted">Asking the AI…</span> : null}
          {fill === 'done' ? (
            <span className="muted small" data-testid="fill-done">
              Review the form, then click Submit on the page yourself.
            </span>
          ) : null}
        </div>
      ) : null}
      {provider.state === 'unavailable' ? (
        <div className="error" role="alert" data-testid="provider-unavailable">
          <strong>The AI is unavailable. The Fill used the built-in rules only.</strong>
          <p className="small">{provider.notice.fix}</p>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void controller.drafts.retryProvider()}>
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {phase === 'ready' ? <OutcomeGroups state={state} controller={controller} /> : null}
      {state.view === null ? null : <DebugReportButton controller={controller} />}
    </>
  );
}
