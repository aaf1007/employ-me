import { useCallback } from 'react';
import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { useStoreQuery } from '../data/use-store-query';
import { ApplicationDetailBody } from './ApplicationDetailBody';

const APPLICATIONS: readonly Topic[] = ['applications'];

export function ApplicationDetail({ id, onClose }: { readonly id: string; readonly onClose: () => void }) {
  const load = useCallback((store: DataStore) => store.getApplication(id), [id]);
  const query = useStoreQuery(APPLICATIONS, load);
  return (
    <section className="card detail stack" style={{ gap: 14 }} data-testid="application-detail">
      {query.result === null ? (
        <p className="muted">Loading…</p>
      ) : query.result.ok ? (
        <ApplicationDetailBody key={id} application={query.result.value} onClose={onClose} />
      ) : (
        <ErrorNotice error={query.result.error}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </ErrorNotice>
      )}
    </section>
  );
}
