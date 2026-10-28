import {
  HELPER_ERROR_FIXES,
  PROTOCOL_VERSION,
  type HealthResult,
  type ProviderStatus,
} from '@employ-me/core';
import { ErrorNotice } from '../common/ErrorNotice';
import { formatDateTime } from '../format';
import { LOW_QUOTA_PERCENT, quotaText } from './quota';

const STATE: Readonly<Record<ProviderStatus['state'], string>> = {
  ready: 'Ready',
  notFound: 'Not found',
  notLoggedIn: 'Not logged in',
  unknown: 'Unknown',
};

const NAMES = { claude: 'Claude', codex: 'Codex' } as const;

/** What the helper reported about itself and each Provider. */
export function HelperHealth({ health }: { readonly health: HealthResult }) {
  return (
    <div className="stack" style={{ gap: 10 }} data-testid="helper-health">
      {health.fakeProvider ? (
        <div className="notice notice-warn">
          <strong>Test mode</strong>
          <p>The helper is using a fake Provider. Nothing is sent to Claude or Codex.</p>
        </div>
      ) : null}
      {health.protocolVersion === PROTOCOL_VERSION ? null : (
        <ErrorNotice
          error={{
            reason: 'protocolMismatch',
            message: 'The helper and the extension are different versions.',
            fix: HELPER_ERROR_FIXES.protocolMismatch,
          }}
        />
      )}
      <dl className="kv">
        <dt>Version</dt>
        <dd data-testid="helper-version">{health.helperVersion}</dd>
        <dt>Log file</dt>
        <dd>
          <code>{health.logFile}</code>
        </dd>
        {health.providers.map((provider) => (
          <div key={provider.id} style={{ display: 'contents' }}>
            <dt>{NAMES[provider.id]}</dt>
            <dd data-testid={`provider-${provider.id}`}>
              {STATE[provider.state]}
              {provider.version === undefined ? '' : ` · ${provider.version}`}
              {provider.problem === undefined ? null : (
                <div className="muted small">{provider.problem.fix}</div>
              )}
              {(provider.quota ?? []).map((quota, index) => (
                <div
                  key={index}
                  className={quota.remainingPercent < LOW_QUOTA_PERCENT ? 'field-error' : 'muted small'}
                  data-testid={`quota-${provider.id}`}
                >
                  {quotaText(quota, formatDateTime)}
                </div>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
