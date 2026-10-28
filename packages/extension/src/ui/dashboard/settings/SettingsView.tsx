import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { PageHeader } from '../common/PageHeader';
import { useStoreQuery } from '../data/use-store-query';
import { BackupSettings } from './BackupSettings';
import { HelperStatus } from './HelperStatus';
import { ProviderSettings } from './ProviderSettings';

const SETTINGS: readonly Topic[] = ['settings'];
const loadSettings = (store: DataStore) => store.getSettings();

export function SettingsView() {
  const settings = useStoreQuery(SETTINGS, loadSettings);
  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <a className="btn" href="#setup">
            Run setup again
          </a>
        }
      />
      <div className="stack">
        {settings.result === null ? (
          <p className="muted">Loading…</p>
        ) : settings.result.ok ? (
          <ProviderSettings key={settings.loads} saved={settings.result.value} />
        ) : (
          <ErrorNotice error={settings.result.error} />
        )}
        <HelperStatus />
        <BackupSettings />
      </div>
    </>
  );
}
