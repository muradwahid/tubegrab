import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useToast, type ToastKind } from '../hooks/useToast';
import { cn } from '../utils/format';

const ICONS: Record<ToastKind, { Icon: typeof Info; cls: string }> = {
  success: { Icon: CircleCheck, cls: 'text-emerald-500' },
  error: { Icon: CircleAlert, cls: 'text-accent' },
  info: { Icon: Info, cls: 'text-sky-500' },
};

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {toasts.map((t) => {
        const { Icon, cls } = ICONS[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cls)} aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">{t.title}</p>
              {t.description && <p className="mt-0.5 break-words text-zinc-600 dark:text-zinc-400">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
