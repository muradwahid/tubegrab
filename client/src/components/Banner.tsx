import type { ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { cn } from '../utils/format';

type Variant = 'info' | 'warning' | 'error';

const STYLES: Record<Variant, { box: string; icon: string; Icon: typeof Info }> = {
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100',
    icon: 'text-sky-500',
    Icon: Info,
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
    icon: 'text-amber-500',
    Icon: TriangleAlert,
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
    icon: 'text-accent',
    Icon: CircleAlert,
  },
};

interface Props {
  variant?: Variant;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ variant = 'info', title, children, action, className }: Props) {
  const s = STYLES[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex animate-fade-in flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center', s.box, className)}
    >
      <div className="flex flex-1 gap-3">
        <s.Icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.icon)} aria-hidden />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{title}</p>
          {children && <div className="mt-1 opacity-85">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
