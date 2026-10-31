import { Ban } from 'lucide-react';
import type { PlaylistVideo } from '../types';
import { cn, formatDuration } from '../utils/format';

interface Props {
  videos: PlaylistVideo[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}

/** Scrollable, checkable list of playlist videos. */
export function PlaylistList({ videos, selected, onToggle, disabled }: Props) {
  return (
    <ul
      className="scrollbar-thin max-h-[28rem] divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
      aria-label="Playlist videos"
    >
      {videos.map((v, i) => {
        const checked = selected.has(v.id);
        return (
          <li key={v.id}>
            <label
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 transition',
                v.unavailable || disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40',
                v.unavailable && 'opacity-50',
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-[#ef4444]"
                checked={checked}
                disabled={disabled || v.unavailable}
                onChange={() => onToggle(v.id)}
                aria-label={`Select ${v.title}`}
              />
              <span className="w-7 shrink-0 text-right text-xs tabular-nums text-zinc-400">{i + 1}</span>
              <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-zinc-200 sm:w-28 dark:bg-zinc-800">
                <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                {v.duration !== null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-semibold tabular-nums text-white">
                    {formatDuration(v.duration)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug" title={v.title}>
                  {v.title}
                </p>
                {v.unavailable ? (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-zinc-500">
                    <Ban className="h-3 w-3" /> Unavailable
                  </p>
                ) : (
                  v.channel && <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{v.channel}</p>
                )}
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
