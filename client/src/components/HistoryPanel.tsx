import { useState } from 'react';
import { ExternalLink, History, ListVideo, RotateCcw, Trash2, Video, X } from 'lucide-react';
import type { HistoryItem } from '../types';
import { formatRelativeTime } from '../utils/format';

interface Props {
  items: HistoryItem[];
  onLoad: (item: HistoryItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** Recent downloads stored in localStorage (last 10). */
export function HistoryPanel({ items, onLoad, onRemove, onClear }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="card p-4 sm:p-6" aria-labelledby="history-heading">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="history-heading" className="flex items-center gap-2 text-base font-bold">
          <History className="h-5 w-5 text-accent" aria-hidden /> Recent downloads
        </h2>
        {items.length > 0 &&
          (confirming ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn px-3 py-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                onClick={() => {
                  onClear();
                  setConfirming(false);
                }}
              >
                Confirm clear
              </button>
              <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" /> Clear history
            </button>
          ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Your last 10 downloads will show up here. History is stored only in this browser.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((item) => {
            const KindIcon = item.kind === 'playlist' ? ListVideo : Video;
            return (
              <li key={item.id} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
                  {item.thumbnail && (
                    <img src={item.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/70 p-0.5 text-white">
                    <KindIcon className="h-3 w-3" aria-label={item.kind} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={item.filename ?? item.title}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {item.detail} · {formatRelativeTime(item.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    className="btn-ghost p-2"
                    onClick={() => onLoad(item)}
                    aria-label={`Load ${item.title} again`}
                    title="Load again"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost p-2"
                    aria-label={`Open ${item.title} on YouTube`}
                    title="Open source"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    className="btn-ghost p-2"
                    onClick={() => onRemove(item.id)}
                    aria-label={`Remove ${item.title} from history`}
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
