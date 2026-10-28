import { createContext, useContext } from 'react';
import type { DataStore } from '../../../storage';

export const StoreContext = createContext<DataStore | null>(null);

/** The open data store. Only components under <StoreProvider> may call it. */
export function useDataStore(): DataStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useDataStore called outside <StoreProvider>');
  return store;
}
