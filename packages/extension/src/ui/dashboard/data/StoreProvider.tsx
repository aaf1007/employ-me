import { useEffect, useState, type ReactNode } from 'react';
import { openDataStore, type DataStore } from '../../../storage';
import { StoreContext } from './store-context';

type Opening =
  | { readonly state: 'opening' }
  | { readonly state: 'open'; readonly store: DataStore }
  | { readonly state: 'failed'; readonly message: string };

/** Opens the extension's database once for the whole dashboard. */
export function StoreProvider({ children }: { readonly children: ReactNode }) {
  const [opening, setOpening] = useState<Opening>({ state: 'opening' });

  useEffect(() => {
    let live = true;
    let opened: DataStore | undefined;
    openDataStore().then(
      (store) => {
        opened = store;
        if (live) setOpening({ state: 'open', store });
        else store.close();
      },
      (error: unknown) => {
        if (live)
          setOpening({ state: 'failed', message: error instanceof Error ? error.message : 'unknown error' });
      },
    );
    return () => {
      live = false;
      opened?.close();
    };
  }, []);

  if (opening.state === 'opening') return <p className="muted">Loading…</p>;
  if (opening.state === 'failed') {
    return (
      <div className="notice notice-error" role="alert">
        <strong>employ-me couldn’t open its data.</strong>
        <p>{opening.message}</p>
        <p>Close other employ-me tabs and reload this page. If it keeps happening, restart Chrome.</p>
      </div>
    );
  }
  return <StoreContext value={opening.store}>{children}</StoreContext>;
}
