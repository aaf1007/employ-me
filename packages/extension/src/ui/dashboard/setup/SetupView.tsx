import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { PageHeader } from '../common/PageHeader';
import { useStoreQuery } from '../data/use-store-query';
import { SetupFlow } from './SetupFlow';

const PROFILE: readonly Topic[] = ['profile'];
const loadFields = (store: DataStore) => store.getProfileFields();

export function SetupView() {
  const profile = useStoreQuery(PROFILE, loadFields);
  return (
    <>
      <PageHeader title="Set up your Profile" intro="About ten minutes. Each step is saved as you go." />
      {profile.result === null ? (
        <p className="muted">Loading…</p>
      ) : profile.result.ok ? (
        // Started from the Profile as first loaded; the flow keeps its own copy as you go.
        <SetupFlow initial={profile.result.value} />
      ) : (
        <ErrorNotice error={profile.result.error} title="Your Profile couldn’t be loaded." />
      )}
    </>
  );
}
