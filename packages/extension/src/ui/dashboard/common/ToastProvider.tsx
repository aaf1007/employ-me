import { useCallback, useState, type ReactNode } from 'react';
import { ToastContext } from './toast-context';

const VISIBLE_MS = 4000;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly { id: number; message: string }[]>([]);

  const show = useCallback((message: string) => {
    const id = Math.random();
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, VISIBLE_MS);
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite" data-testid="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
