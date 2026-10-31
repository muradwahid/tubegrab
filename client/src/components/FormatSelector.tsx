import type { OutputFormat } from '../types';
import { cn } from '../utils/format';

interface Props {
  value: OutputFormat;
  onChange: (f: OutputFormat) => void;
  disabled?: boolean;
  /** Shown instead of the options' hint, e.g. when an audio quality is selected. */
  note?: string | null;
}

const OPTIONS: Array<{ id: OutputFormat; label: string; hint: string }> = [
  { id: 'mp4', label: 'MP4', hint: 'Plays everywhere' },
  { id: 'webm', label: 'WEBM', hint: 'Smaller, VP9/Opus' },
];

export function FormatSelector({ value, onChange, disabled, note }: Props) {
  return (
    <fieldset disabled={disabled}>
      <legend className="section-label">Output format</legend>
      <div role="radiogroup" className="inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
        {OPTIONS.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.id)}
              title={o.hint}
              className={cn(
                'rounded-lg px-5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed',
                active
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white',
                disabled && 'opacity-50',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {note ?? OPTIONS.find((o) => o.id === value)?.hint}
      </p>
    </fieldset>
  );
}
