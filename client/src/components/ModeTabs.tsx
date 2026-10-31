import { ListVideo, Video } from 'lucide-react';
import type { Mode } from '../types';
import { cn } from '../utils/format';

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

const TABS: Array<{ id: Mode; label: string; Icon: typeof Video }> = [
  { id: 'single', label: 'Single Video', Icon: Video },
  { id: 'playlist', label: 'Full Playlist', Icon: ListVideo },
];

export function ModeTabs({ mode, onChange, disabled }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Download mode"
      className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70"
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = id === mode;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={active}
            aria-controls={`panel-${id}`}
            disabled={disabled && !active}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            <Icon className={cn('h-4 w-4', active && 'text-accent')} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
