import { createContext, useContext } from 'react';

export type Toast = (message: string) => void;

export const ToastContext = createContext<Toast>(() => undefined);

/** Shows a short message that goes away by itself: "Profile saved". */
export function useToast(): Toast {
  return useContext(ToastContext);
}
