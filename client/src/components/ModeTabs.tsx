import { ListVideo, Tv, Video } from 'lucide-react';
import type { Mode } from '../types';
import { cn } from '../utils/format';

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

const TABS: Array<{ id: Mode; label: string; short: string; Icon: typeof Video }> = [
  { id: 'single', label: 'Single Video', short: 'Video', Icon: Video },
  { id: 'playlist', label: 'Full Playlist', short: 'Playlist', Icon: ListVideo },
  { id: 'channel', label: 'Channel', short: 'Channel', Icon: Tv },
];

export function ModeTabs({ mode, onChange, disabled }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Download mode"
      className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70"
    >
      {TABS.map(({ id, label, short, Icon }) => {
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
              'flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 sm:gap-2 sm:px-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', active && 'text-accent')} />
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
