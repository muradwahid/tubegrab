import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastApi {
  toasts: Toast[];
  show: (kind: ToastKind, title: string, description?: string) => void;
  dismiss: (id: number) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DURATION: Record<ToastKind, number> = { success: 4500, info: 4500, error: 7000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, title, description }]);
      window.setTimeout(() => dismiss(id), DURATION[kind]);
    },
    [dismiss],
  );

  const value = useMemo<ToastApi>(
    () => ({
      toasts,
      show,
      dismiss,
      success: (t, d) => show('success', t, d),
      error: (t, d) => show('error', t, d),
      info: (t, d) => show('info', t, d),
    }),
    [toasts, show, dismiss],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
