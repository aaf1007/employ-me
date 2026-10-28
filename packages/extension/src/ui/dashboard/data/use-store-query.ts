import { useEffect, useState } from 'react';
import { onDataChanged, type DataResult, type DataStore, type Topic } from '../../../storage';
import { useDataStore } from './store-context';

export interface StoreQuery<T> {
  /** Null while the first load is in flight. */
  readonly result: DataResult<T> | null;
  /** Bumps on every completed load: use it as a `key` to reset forms built from the result. */
  readonly loads: number;
  readonly reload: () => void;
}

/**
 * Loads data from the store, and loads it again whenever any of `topics`
 * changes in any extension page (a Fill in the side panel, another tab).
 * `topics` and `load` must be stable: module constants or memoized.
 */
export function useStoreQuery<T>(
  topics: readonly Topic[],
  load: (store: DataStore) => Promise<DataResult<T>>,
): StoreQuery<T> {
  const store = useDataStore();
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ result: DataResult<T>; loads: number } | null>(null);

  useEffect(
    () =>
      onDataChanged(topics, () => {
        setVersion((v) => v + 1);
      }),
    [topics],
  );

  useEffect(() => {
    let live = true;
    void load(store).then((result) => {
      if (live) setLoaded((previous) => ({ result, loads: (previous?.loads ?? 0) + 1 }));
    });
    return () => {
      live = false;
    };
  }, [store, load, version]);

  return {
    result: loaded?.result ?? null,
    loads: loaded?.loads ?? 0,
    reload: () => {
      setVersion((v) => v + 1);
    },
  };
}
