import { Music } from 'lucide-react';
import type { Quality } from '../types';
import { cn } from '../utils/format';

export interface ResolutionChoice {
  id: Quality;
  label: string;
  kind: 'video' | 'audio';
  /** Secondary line, e.g. "~48 MB". */
  detail?: string | null;
  /** Small badge, e.g. "4K", "HD", "60fps". */
  badge?: string | null;
}

interface Props {
  choices: ResolutionChoice[];
  value: Quality | null;
  onChange: (q: Quality) => void;
  disabled?: boolean;
  label?: string;
}

/** Radio-card grid of available resolutions, with audio-only options in their own row. */
export function ResolutionSelector({ choices, value, onChange, disabled, label = 'Resolution' }: Props) {
  const video = choices.filter((c) => c.kind === 'video');
  const audio = choices.filter((c) => c.kind === 'audio');

  const renderGroup = (items: ResolutionChoice[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((c) => {
        const selected = c.id === value;
        return (
          <label
            key={c.id}
            className={cn(
              'relative flex min-h-16 flex-col justify-center rounded-xl border px-3 py-2.5 transition',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              selected
                ? 'border-accent bg-red-50 ring-2 ring-accent/30 dark:bg-red-500/10'
                : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700/80 dark:bg-zinc-950/40 dark:hover:border-zinc-600',
            )}
          >
            <input
              type="radio"
              name="resolution"
              value={c.id}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(c.id)}
              className="sr-only"
            />
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {c.kind === 'audio' && <Music className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />}
              <span className="truncate">{c.label}</span>
            </span>
            {c.detail && (
              <span className="mt-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{c.detail}</span>
            )}
            {c.badge && (
              <span
                className={cn(
                  'absolute right-2 top-2 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide',
                  selected ? 'bg-accent text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
                )}
              >
                {c.badge}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );

  return (
    <fieldset disabled={disabled}>
      <legend className="section-label">{label}</legend>
      <div className="space-y-2">
        {video.length > 0 && renderGroup(video)}
        {audio.length > 0 && renderGroup(audio)}
      </div>
    </fieldset>
  );
}
