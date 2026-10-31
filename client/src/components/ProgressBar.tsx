import type { JobStatus } from '../types';
import { cn, formatBytes, formatEta, formatSpeed } from '../utils/format';

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  starting: 'Starting…',
  downloading: 'Downloading',
  merging: 'Merging audio & video…',
  converting: 'Converting audio…',
  done: 'Complete',
  error: 'Failed',
  cancelled: 'Cancelled',
};

interface Props {
  status: JobStatus;
  percent: number;
  speed?: number | null;
  eta?: number | null;
  downloadedBytes?: number;
  totalBytes?: number | null;
  /** Compact = thin bar without the stats row (used in the playlist queue). */
  compact?: boolean;
}

export function ProgressBar({ status, percent, speed, eta, downloadedBytes, totalBytes, compact }: Props) {
  const indeterminate = status === 'starting' || status === 'merging' || status === 'converting';
  const value = Math.max(0, Math.min(100, percent));
  const barColor =
    status === 'error'
      ? 'bg-red-600'
      : status === 'done'
        ? 'bg-emerald-500'
        : status === 'cancelled'
          ? 'bg-zinc-400'
          : 'bg-accent';

  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">{STATUS_LABEL[status]}</span>
          <span className="font-bold tabular-nums">{indeterminate && value === 0 ? '' : `${value.toFixed(value >= 100 ? 0 : 1)}%`}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={STATUS_LABEL[status]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(value)}
        className={cn('relative w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800', compact ? 'h-1.5' : 'h-3')}
      >
        {indeterminate ? (
          <div key="indeterminate" className={cn('absolute inset-y-0 w-2/5 animate-indeterminate rounded-full', barColor)} />
        ) : (
          <div
            key="determinate"
            className={cn('h-full rounded-full transition-[width] duration-300 ease-out', barColor)}
            style={{ width: `${value}%` }}
          />
        )}
      </div>
      {!compact && status === 'downloading' && (
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          <span>
            {formatBytes(downloadedBytes)}
            {totalBytes ? ` of ${formatBytes(totalBytes)}` : ''}
          </span>
          <span className="flex gap-4">
            <span>Speed: {formatSpeed(speed)}</span>
            <span>ETA: {formatEta(eta)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
