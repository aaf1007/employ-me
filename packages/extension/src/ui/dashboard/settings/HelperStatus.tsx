import type { HealthResult } from '@employ-me/core';
import { useCallback, useEffect, useState } from 'react';
import type { BackgroundError } from '../../../messaging/background';
import { callBackground } from '../../../messaging/background-client';
import { ErrorNotice } from '../common/ErrorNotice';
import { HelperHealth } from './HelperHealth';

type Check =
  | { readonly state: 'checking' }
  | { readonly state: 'ok'; readonly health: HealthResult }
  | { readonly state: 'failed'; readonly error: BackgroundError };

/** The same health `npx employ-me doctor` prints. */
export function HelperStatus() {
  const [check, setCheck] = useState<Check>({ state: 'checking' });

  const run = useCallback(() => {
    void callBackground('helper.health', {}).then((result) => {
      setCheck(result.ok ? { state: 'ok', health: result.value } : { state: 'failed', error: result.error });
    });
  }, []);

  useEffect(run, [run]);

  return (
    <section className="card stack" style={{ gap: 12 }} data-testid="helper-status" data-state={check.state}>
      <div className="row">
        <h2 style={{ margin: 0 }}>Helper</h2>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-small"
          disabled={check.state === 'checking'}
          onClick={() => {
            setCheck({ state: 'checking' });
            run();
          }}
        >
          Check again
        </button>
      </div>
      <p className="card-intro" style={{ margin: 0 }}>
        The small program on this computer that runs your Provider’s CLI. Install or repair it with{' '}
        <code>npx employ-me setup</code>.
      </p>
      {check.state === 'checking' ? <p className="muted">Checking…</p> : null}
      {check.state === 'failed' ? (
        <ErrorNotice error={check.error} title="The helper isn’t working." />
      ) : null}
      {check.state === 'ok' ? <HelperHealth health={check.health} /> : null}
    </section>
  );
}
