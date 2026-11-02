import { Download, X } from 'lucide-react';
import type { PlaylistVideo } from '../types';
import { formatDuration, triggerDownload } from '../utils/format';
import { api } from '../api/client';
import type { BatchDownload } from '../hooks/useBatchDownload';
import { DownloadQueue } from './DownloadQueue';
import { PlaylistSkeleton } from './Skeleton';
import { ResolutionSelector, type ResolutionChoice } from './ResolutionSelector';
import { FormatSelector } from './FormatSelector';

const BATCH_CHOICES: ResolutionChoice[] = [
  { id: '1080p', label: '1080p', kind: 'video', detail: 'Full HD', badge: 'HD' },
  { id: '720p', label: '720p', kind: 'video', detail: 'HD', badge: 'HD' },
  { id: '480p', label: '480p', kind: 'video', detail: 'Standard' },
  { id: '360p', label: '360p', kind: 'video', detail: 'Data saver' },
  { id: 'mp3', label: 'Audio · MP3', kind: 'audio', detail: 'Best quality' },
];

interface OptionsProps {
  dl: BatchDownload;
  selected: PlaylistVideo[];
  availableCount: number;
  /** Server limit for one batch (MAX_PLAYLIST_SIZE). */
  maxCount: number;
  onStart: () => void;
}

/** Resolution + format + "Download Selected" for multi-video downloads. */
export function BatchOptions({ dl, selected, availableCount, maxCount, onStart }: OptionsProps) {
  const isAudio = dl.quality === 'mp3';
  const tooMany = selected.length > maxCount;
  const totalDuration = selected.reduce((s, v) => s + (v.duration ?? 0), 0);
  return (
    <>
      <ResolutionSelector label="Resolution for all videos" choices={BATCH_CHOICES} value={dl.quality} onChange={dl.setQuality} />
      <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        If a video doesn’t have this resolution, the next best lower one is used and marked with a “fallback” badge.
      </p>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <FormatSelector
          value={dl.format}
          onChange={dl.setFormat}
          disabled={isAudio}
          note={isAudio ? 'Audio is saved as MP3.' : null}
        />
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            className="btn-primary h-12 px-8 text-base"
            onClick={onStart}
            disabled={selected.length === 0 || tooMany || dl.starting}
          >
            <Download className="h-5 w-5" /> Download Selected ({selected.length})
          </button>
          <span className={`text-center text-xs sm:text-right ${tooMany ? 'font-semibold text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {tooMany
              ? `Select at most ${maxCount} videos per download.`
              : `${selected.length} of ${availableCount} selected · ${formatDuration(totalDuration)} total`}
          </span>
        </div>
      </div>
    </>
  );
}

interface QueueProps {
  dl: BatchDownload;
  videos: ReadonlyMap<string, PlaylistVideo>;
}

/** The running/finished batch: queue, ZIP and "back to selection". */
export function BatchQueue({ dl, videos }: QueueProps) {
  const { batch } = dl;
  if (!batch) return <PlaylistSkeleton />;
  return (
    <>
      <DownloadQueue
        batch={batch}
        videos={videos}
        fileUrl={api.fileUrl}
        onZip={() => triggerDownload(api.zipUrl(batch.batchId))}
        onRetry={(id) => void dl.retry(id)}
        onCancel={() => void dl.cancel()}
        retrying={dl.retrying}
      />
      {batch.status !== 'running' && (
        <div className="flex justify-end">
          <button type="button" className="btn-ghost" onClick={dl.reset}>
            <X className="h-4 w-4" /> Back to selection
          </button>
        </div>
      )}
    </>
  );
}
