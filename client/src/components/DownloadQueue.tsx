import { CircleCheck, CircleStop, CircleX, Clock, Download, FileArchive, LoaderCircle, RotateCcw } from 'lucide-react';
import type { BatchItemSnapshot, BatchSnapshot, JobStatus, PlaylistVideo } from '../types';
import { TERMINAL_STATUSES } from '../types';
import { cn } from '../utils/format';
import { ProgressBar } from './ProgressBar';

interface Props {
  batch: BatchSnapshot;
  videos: ReadonlyMap<string, PlaylistVideo>;
  fileUrl: (jobId: string) => string;
  onRetry: (videoId: string) => void;
  onCancel: () => void;
  onZip: () => void;
  retrying: ReadonlySet<string>;
}

const CHIP: Record<JobStatus, { label: string; cls: string }> = {
  queued: { label: 'Queued', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
  starting: { label: 'Starting', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  downloading: { label: 'Downloading', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  merging: { label: 'Merging', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  converting: { label: 'Converting', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  error: { label: 'Failed', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
};

function StatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case 'done':
      return <CircleCheck className="h-5 w-5 text-emerald-500" />;
    case 'error':
      return <CircleX className="h-5 w-5 text-accent" />;
    case 'cancelled':
      return <CircleStop className="h-5 w-5 text-zinc-400" />;
    case 'queued':
      return <Clock className="h-5 w-5 text-zinc-400" />;
    default:
      return <LoaderCircle className="h-5 w-5 animate-spin text-accent" />;
  }
}

function overallPercent(batch: BatchSnapshot): number {
  if (batch.total === 0) return 0;
  const sum = batch.items.reduce(
    (s, i) => s + (TERMINAL_STATUSES.has(i.status) ? 100 : i.status === 'queued' ? 0 : i.percent),
    0,
  );
  return sum / batch.total;
}

function headline(batch: BatchSnapshot): string {
  const finished = batch.items.filter((i) => TERMINAL_STATUSES.has(i.status)).length;
  if (batch.status === 'cancelled') return `Cancelled — ${batch.completed} of ${batch.total} downloaded`;
  if (batch.status === 'done') {
    return batch.failed > 0
      ? `Finished — ${batch.completed} of ${batch.total} downloaded, ${batch.failed} failed`
      : `All ${batch.total} videos downloaded`;
  }
  return `Downloading ${Math.min(finished + 1, batch.total)} of ${batch.total}`;
}

/** Overall + per-video status for a playlist batch, with retry, file links and ZIP. */
export function DownloadQueue({ batch, videos, fileUrl, onRetry, onCancel, onZip, retrying }: Props) {
  const running = batch.status === 'running';
  const percent = overallPercent(batch);

  return (
    <section className="space-y-4" aria-label="Download queue">
      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite">
            <p className="font-semibold">{headline(batch)}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {batch.completed} done · {batch.failed} failed · {batch.active} active · up to 2 at a time
            </p>
          </div>
          <div className="flex gap-2">
            {running ? (
              <button type="button" className="btn-secondary py-2" onClick={onCancel}>
                <CircleStop className="h-4 w-4" /> Cancel all
              </button>
            ) : (
              batch.completed > 0 && (
                <button type="button" className="btn-primary py-2" onClick={onZip}>
                  <FileArchive className="h-4 w-4" /> Download as ZIP
                </button>
              )
            )}
          </div>
        </div>
        <ProgressBar status={running ? 'downloading' : batch.failed === batch.total ? 'error' : 'done'} percent={percent} compact />
      </div>

      <ul className="scrollbar-thin max-h-[32rem] divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {batch.items.map((item) => (
          <QueueRow
            key={item.videoId}
            item={item}
            video={videos.get(item.videoId)}
            fileUrl={item.jobId && item.status === 'done' ? fileUrl(item.jobId) : null}
            onRetry={() => onRetry(item.videoId)}
            retrying={retrying.has(item.videoId)}
          />
        ))}
      </ul>
    </section>
  );
}

function QueueRow({
  item,
  video,
  fileUrl,
  onRetry,
  retrying,
}: {
  item: BatchItemSnapshot;
  video?: PlaylistVideo;
  fileUrl: string | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const chip = CHIP[item.status];
  const inProgress = !TERMINAL_STATUSES.has(item.status) && item.status !== 'queued';
  const title = item.title ?? video?.title ?? item.videoId;

  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-400">{item.index + 1}</span>
      <StatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded px-1.5 py-px text-[11px] font-semibold', chip.cls)}>
            {chip.label}
            {item.status === 'downloading' ? ` ${Math.round(item.percent)}%` : ''}
          </span>
          {item.fallback && item.actualQuality && (
            <span className="rounded bg-amber-100 px-1.5 py-px text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              fallback: {item.actualQuality}
            </span>
          )}
          {item.status === 'error' && item.error && (
            <span className="truncate text-xs text-red-600 dark:text-red-400" title={item.error}>
              {item.error}
            </span>
          )}
        </div>
        {inProgress && (
          <div className="mt-2">
            <ProgressBar status={item.status} percent={item.percent} compact />
          </div>
        )}
      </div>
      <div className="shrink-0">
        {fileUrl && (
          <a href={fileUrl} className="btn-ghost px-2.5 py-1.5" aria-label={`Download ${item.filename ?? title}`} title={item.filename ?? undefined}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Save</span>
          </a>
        )}
        {(item.status === 'error' || item.status === 'cancelled') && (
          <button type="button" className="btn-secondary px-2.5 py-1.5" onClick={onRetry} disabled={retrying}>
            <RotateCcw className={cn('h-4 w-4', retrying && 'animate-spin')} />
            <span className="hidden sm:inline">Retry</span>
          </button>
        )}
      </div>
    </li>
  );
}
