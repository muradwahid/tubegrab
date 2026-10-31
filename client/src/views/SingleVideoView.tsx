import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CircleStop, Download, RotateCcw } from 'lucide-react';
import { api, ApiError, BackendUnreachableError, errorMessage } from '../api/client';
import { useEventSource } from '../hooks/useEventSource';
import { useToast } from '../hooks/useToast';
import type { HistoryItem, JobSnapshot, OutputFormat, Quality, VideoInfo } from '../types';
import { TERMINAL_STATUSES } from '../types';
import { formatBytes, isPlaylistUrl, triggerDownload } from '../utils/format';
import { UrlInput } from '../components/UrlInput';
import { Banner } from '../components/Banner';
import { VideoPreviewCard } from '../components/VideoPreviewCard';
import { VideoPreviewSkeleton } from '../components/Skeleton';
import { ResolutionSelector, type ResolutionChoice } from '../components/ResolutionSelector';
import { FormatSelector } from '../components/FormatSelector';
import { ProgressBar } from '../components/ProgressBar';

interface Props {
  url: string;
  onUrlChange: (url: string) => void;
  /** Incrementing this asks the view to fetch `url` (e.g. from history). */
  fetchSignal: number;
  onSwitchToPlaylist: () => void;
  onDownloaded: (item: Omit<HistoryItem, 'id' | 'createdAt'>) => void;
}

function defaultQuality(info: VideoInfo): Quality | null {
  const video = info.qualities.filter((q) => q.kind === 'video');
  return (video.find((q) => (q.height ?? 0) <= 1080) ?? video[0] ?? info.qualities[0])?.id ?? null;
}

export function SingleVideoView({ url, onUrlChange, fetchSignal, onSwitchToPlaylist, onDownloaded }: Props) {
  const toast = useToast();
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [format, setFormat] = useState<OutputFormat>('mp4');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const active = starting || (job !== null && !TERMINAL_STATUSES.has(job.status));
  const selected = info?.qualities.find((q) => q.id === quality) ?? null;
  const isAudio = selected?.kind === 'audio';

  const fetchInfo = useCallback(
    async (target: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFetchError(null);
      setInfo(null);
      setJob(null);
      setJobId(null);
      try {
        const result = await api.info(target, controller.signal);
        setInfo(result);
        setQuality(defaultQuality(result));
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = errorMessage(err);
        setFetchError(msg);
        if (!(err instanceof BackendUnreachableError)) toast.error('Couldn’t fetch video', msg);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [toast],
  );

  // Fetch when asked externally (history "load again").
  useEffect(() => {
    if (fetchSignal > 0 && url) void fetchInfo(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSignal]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const choices = useMemo<ResolutionChoice[]>(
    () =>
      (info?.qualities ?? []).map((q) => {
        const size = q.kind === 'audio' ? q.sizes.audio : q.sizes[format];
        const parts = [size ? `~${formatBytes(size)}` : null, q.fps && q.fps > 30 ? `${q.fps}fps` : null];
        const h = q.height ?? 0;
        return {
          id: q.id,
          label: q.kind === 'video' ? `${h}p` : `Audio · ${q.id.toUpperCase()}`,
          kind: q.kind,
          detail: parts.filter(Boolean).join(' · ') || null,
          badge: h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 720 ? 'HD' : null,
        };
      }),
    [info, format],
  );

  useEventSource<JobSnapshot>(
    jobId ? api.progressUrl(jobId) : null,
    (snapshot) => {
      setJob(snapshot);
      if (snapshot.status === 'done') {
        triggerDownload(api.fileUrl(snapshot.jobId));
        toast.success('Download complete', snapshot.filename ?? undefined);
        if (info) {
          onDownloaded({
            kind: 'video',
            title: info.title,
            url: info.url,
            thumbnail: info.thumbnail,
            detail:
              snapshot.quality === 'mp3' || snapshot.quality === 'm4a'
                ? `Audio · ${snapshot.quality.toUpperCase()}`
                : `${snapshot.actualQuality ?? snapshot.quality} · ${(snapshot.filename?.split('.').pop() ?? format).toUpperCase()}`,
            filename: snapshot.filename,
          });
        }
      } else if (snapshot.status === 'error') {
        toast.error('Download failed', snapshot.error ?? undefined);
      }
      return TERMINAL_STATUSES.has(snapshot.status);
    },
    () => {
      setJob((j) =>
        j && !TERMINAL_STATUSES.has(j.status)
          ? { ...j, status: 'error', error: 'Lost connection to the server.' }
          : j,
      );
    },
  );

  const startDownload = async () => {
    if (!info || !quality) return;
    setStarting(true);
    setJob(null);
    try {
      const { jobId: id } = await api.startDownload(info.url, quality, format);
      setJobId(id);
    } catch (err) {
      const msg = errorMessage(err);
      if (!(err instanceof BackendUnreachableError)) {
        toast.error(err instanceof ApiError && err.status === 429 ? 'Slow down' : 'Couldn’t start download', msg);
      }
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!jobId) return;
    try {
      await api.cancelDownload(jobId);
      toast.info('Download cancelled');
    } catch (err) {
      toast.error('Couldn’t cancel', errorMessage(err));
    }
  };

  const showPlaylistHint = isPlaylistUrl(url);

  return (
    <div className="space-y-6">
      <UrlInput
        value={url}
        onChange={onUrlChange}
        onSubmit={(u) => void fetchInfo(u)}
        submitLabel="Fetch Info"
        placeholder="https://www.youtube.com/watch?v=…"
        loading={loading}
        disabled={active}
        onPasteError={(m) => toast.info(m)}
      />

      {showPlaylistHint && (
        <Banner
          variant="info"
          title="This looks like a playlist — switch to Playlist mode?"
          action={
            <button type="button" className="btn-secondary py-2" onClick={onSwitchToPlaylist} aria-label="Switch to Playlist mode">
              Switch <ArrowRight className="h-4 w-4" />
            </button>
          }
        >
          You can still fetch just this one video here.
        </Banner>
      )}

      {loading && <VideoPreviewSkeleton />}

      {fetchError && !loading && (
        <Banner
          variant="error"
          title="Couldn’t load this video"
          action={
            url.trim() ? (
              <button type="button" className="btn-secondary py-2" onClick={() => void fetchInfo(url.trim())}>
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
            ) : null
          }
        >
          {fetchError}
        </Banner>
      )}

      {info && !loading && (
        <div className="space-y-6">
          <VideoPreviewCard info={info} />

          <ResolutionSelector choices={choices} value={quality} onChange={setQuality} disabled={active} />

          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <FormatSelector
              value={format}
              onChange={setFormat}
              disabled={active || isAudio}
              note={isAudio ? `Audio is saved as ${quality?.toUpperCase()}.` : null}
            />
            {active ? (
              <button type="button" className="btn-secondary h-12 px-6" onClick={() => void cancel()} disabled={!jobId}>
                <CircleStop className="h-5 w-5" /> Cancel
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary h-12 px-8 text-base"
                onClick={() => void startDownload()}
                disabled={!quality}
              >
                <Download className="h-5 w-5" /> Download
              </button>
            )}
          </div>

          {job && (
            <div className="animate-fade-in rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <ProgressBar
                status={job.status}
                percent={job.percent}
                speed={job.speed}
                eta={job.eta}
                downloadedBytes={job.downloadedBytes}
                totalBytes={job.totalBytes}
              />
              {job.status === 'error' && job.error && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{job.error}</p>
              )}
              {job.status === 'done' && (
                <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-zinc-600 dark:text-zinc-300">
                    Saved as <span className="break-all font-medium">{job.filename}</span>
                    {job.fallback && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                        fallback: {job.actualQuality}
                      </span>
                    )}
                  </p>
                  <a href={api.fileUrl(job.jobId)} className="btn-ghost shrink-0 px-3 py-1.5">
                    <Download className="h-4 w-4" /> Save again
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
