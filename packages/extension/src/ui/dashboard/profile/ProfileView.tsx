import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { PageHeader } from '../common/PageHeader';
import { useStoreQuery } from '../data/use-store-query';
import { ProfileEditor } from './ProfileEditor';

const PROFILE: readonly Topic[] = ['profile'];
const SETTINGS: readonly Topic[] = ['settings'];
const loadFields = (store: DataStore) => store.getProfileFields();
const loadSettings = (store: DataStore) => store.getSettings();

export function ProfileView() {
  const profile = useStoreQuery(PROFILE, loadFields);
  const settings = useStoreQuery(SETTINGS, loadSettings);
  const notSetUp = settings.result?.ok === true && settings.result.value.setupCompletedAt === undefined;
  return (
    <>
      <PageHeader
        title="Profile"
        intro="The facts about you that Application Forms ask for. Everything stays on this computer."
      />
      {notSetUp ? (
        <div className="notice notice-info" style={{ marginBottom: 16 }} data-testid="setup-banner">
          <strong>Set up your Profile from your Resume.</strong>
          <p>
            Add a Resume, check what was read from it, then answer a few questions.{' '}
            <a href="#setup">Start setup</a>
          </p>
        </div>
      ) : null}
      {profile.result === null ? (
        <p className="muted">Loading…</p>
      ) : profile.result.ok ? (
        <ProfileEditor key={profile.loads} saved={profile.result.value} />
      ) : (
        <ErrorNotice error={profile.result.error} title="Your Profile couldn’t be loaded." />
      )}
    </>
  );
}
