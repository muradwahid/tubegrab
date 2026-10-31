import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ListChecks, RotateCcw, SquareCheck, X } from 'lucide-react';
import { api, ApiError, BackendUnreachableError, errorMessage } from '../api/client';
import { useEventSource } from '../hooks/useEventSource';
import { useToast } from '../hooks/useToast';
import type { BatchSnapshot, HistoryItem, OutputFormat, PlaylistInfo, PlaylistVideo, Quality } from '../types';
import { formatDuration, triggerDownload } from '../utils/format';
import { UrlInput } from '../components/UrlInput';
import { Banner } from '../components/Banner';
import { PlaylistSkeleton } from '../components/Skeleton';
import { PlaylistList } from '../components/PlaylistList';
import { DownloadQueue } from '../components/DownloadQueue';
import { ResolutionSelector, type ResolutionChoice } from '../components/ResolutionSelector';
import { FormatSelector } from '../components/FormatSelector';

interface Props {
  url: string;
  onUrlChange: (url: string) => void;
  fetchSignal: number;
  onDownloaded: (item: Omit<HistoryItem, 'id' | 'createdAt'>) => void;
}

const PLAYLIST_CHOICES: ResolutionChoice[] = [
  { id: '1080p', label: '1080p', kind: 'video', detail: 'Full HD', badge: 'HD' },
  { id: '720p', label: '720p', kind: 'video', detail: 'HD', badge: 'HD' },
  { id: '480p', label: '480p', kind: 'video', detail: 'Standard' },
  { id: '360p', label: '360p', kind: 'video', detail: 'Data saver' },
  { id: 'mp3', label: 'Audio · MP3', kind: 'audio', detail: 'Best quality' },
];

export function PlaylistView({ url, onUrlChange, fetchSignal, onDownloaded }: Props) {
  const toast = useToast();
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [quality, setQuality] = useState<Quality>('1080p');
  const [format, setFormat] = useState<OutputFormat>('mp4');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchSnapshot | null>(null);
  /** Bumped to re-open the SSE stream after a retry on a finished batch. */
  const [streamKey, setStreamKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const announcedRef = useRef<string | null>(null);

  const available = useMemo(() => playlist?.videos.filter((v) => !v.unavailable) ?? [], [playlist]);
  const videoMap = useMemo(
    () => new Map<string, PlaylistVideo>((playlist?.videos ?? []).map((v) => [v.id, v])),
    [playlist],
  );
  const selectedVideos = useMemo(() => available.filter((v) => selected.has(v.id)), [available, selected]);
  const totalDuration = selectedVideos.reduce((s, v) => s + (v.duration ?? 0), 0);
  const running = starting || batch?.status === 'running';

  const fetchPlaylist = useCallback(
    async (target: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFetchError(null);
      setPlaylist(null);
      setBatch(null);
      setBatchId(null);
      try {
        const result = await api.playlist(target, controller.signal);
        setPlaylist(result);
        const ids = result.videos.filter((v) => !v.unavailable).map((v) => v.id);
        setSelected(new Set(ids));
        setRangeFrom('1');
        setRangeTo(String(result.videos.length));
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = errorMessage(err);
        setFetchError(msg);
        if (!(err instanceof BackendUnreachableError)) toast.error('Couldn’t fetch playlist', msg);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (fetchSignal > 0 && url) void fetchPlaylist(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSignal]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEventSource<BatchSnapshot>(
    batchId ? `${api.batchProgressUrl(batchId)}?k=${streamKey}` : null,
    (snapshot) => {
      setBatch(snapshot);
      if (snapshot.status === 'running') return false;
      // Announce each finished run once (a retry starts a new run).
      const signature = `${snapshot.batchId}:${snapshot.completed}:${snapshot.failed}`;
      if (snapshot.status === 'done' && announcedRef.current !== signature) {
        announcedRef.current = signature;
        if (snapshot.failed === 0) {
          toast.success('Playlist downloaded', `${snapshot.completed} videos ready — grab the ZIP or individual files.`);
        } else {
          toast.info('Playlist finished with errors', `${snapshot.completed} downloaded, ${snapshot.failed} failed.`);
        }
        if (playlist && snapshot.completed > 0) {
          onDownloaded({
            kind: 'playlist',
            title: playlist.title,
            url,
            thumbnail: playlist.videos[0]?.thumbnail ?? null,
            detail: `${snapshot.completed} video${snapshot.completed === 1 ? '' : 's'} · ${snapshot.quality}`,
            filename: null,
          });
        }
      }
      return true;
    },
    () => toast.error('Lost connection to the server', 'Progress updates stopped.'),
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyRange = () => {
    if (!playlist) return;
    const n = playlist.videos.length;
    let from = Number.parseInt(rangeFrom, 10);
    let to = Number.parseInt(rangeTo, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      toast.error('Invalid range', 'Enter two video numbers, e.g. 5 to 20.');
      return;
    }
    from = Math.max(1, Math.min(n, from));
    to = Math.max(1, Math.min(n, to));
    if (from > to) [from, to] = [to, from];
    setRangeFrom(String(from));
    setRangeTo(String(to));
    setSelected(
      new Set(
        playlist.videos
          .slice(from - 1, to)
          .filter((v) => !v.unavailable)
          .map((v) => v.id),
      ),
    );
  };

  const start = async () => {
    if (!playlist || selectedVideos.length === 0) return;
    setStarting(true);
    try {
      const { batchId: id } = await api.startPlaylist(
        selectedVideos.map((v) => ({ id: v.id, title: v.title })),
        quality,
        format,
        playlist.title,
      );
      announcedRef.current = null;
      setBatch(null);
      setBatchId(id);
    } catch (err) {
      if (!(err instanceof BackendUnreachableError)) {
        toast.error(
          err instanceof ApiError && err.status === 429 ? 'Slow down' : 'Couldn’t start downloads',
          errorMessage(err),
        );
      }
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!batchId) return;
    try {
      await api.cancelPlaylist(batchId);
      toast.info('Playlist download cancelled');
    } catch (err) {
      toast.error('Couldn’t cancel', errorMessage(err));
    }
  };

  const retry = async (videoId: string) => {
    if (!batchId) return;
    setRetrying((s) => new Set(s).add(videoId));
    try {
      await api.retryPlaylistItem(batchId, videoId);
      // The stream closes when a batch finishes; reopen it to follow the retry.
      if (batch?.status !== 'running') setStreamKey((k) => k + 1);
    } catch (err) {
      toast.error('Retry failed', errorMessage(err));
    } finally {
      setRetrying((s) => {
        const next = new Set(s);
        next.delete(videoId);
        return next;
      });
    }
  };

  const reset = () => {
    setBatch(null);
    setBatchId(null);
  };

  const isAudio = quality === 'mp3';

  return (
    <div className="space-y-6">
      <UrlInput
        value={url}
        onChange={onUrlChange}
        onSubmit={(u) => void fetchPlaylist(u)}
        submitLabel="Fetch Playlist"
        placeholder="https://www.youtube.com/playlist?list=…"
        loading={loading}
        disabled={running}
        onPasteError={(m) => toast.info(m)}
      />

      {loading && <PlaylistSkeleton />}

      {fetchError && !loading && (
        <Banner
          variant="error"
          title="Couldn’t load this playlist"
          action={
            url.trim() ? (
              <button type="button" className="btn-secondary py-2" onClick={() => void fetchPlaylist(url.trim())}>
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
            ) : null
          }
        >
          {fetchError}
        </Banner>
      )}

      {playlist && !loading && (
        <div className="animate-fade-in space-y-6">
          <div>
            <h2 className="text-lg font-bold leading-snug sm:text-xl">{playlist.title}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {playlist.channel ? `${playlist.channel} · ` : ''}
              {playlist.totalCount} video{playlist.totalCount === 1 ? '' : 's'}
            </p>
          </div>

          {playlist.truncated && (
            <Banner variant="warning" title={`Showing the first ${playlist.videos.length} of ${playlist.totalCount} videos`}>
              Playlists are limited to {playlist.maxSize} videos per download.
            </Banner>
          )}

          {batch || batchId ? (
            batch ? (
              <>
                <DownloadQueue
                  batch={batch}
                  videos={videoMap}
                  fileUrl={api.fileUrl}
                  onZip={() => triggerDownload(api.zipUrl(batch.batchId))}
                  onRetry={(id) => void retry(id)}
                  onCancel={() => void cancel()}
                  retrying={retrying}
                />
                {batch.status !== 'running' && (
                  <div className="flex justify-end">
                    <button type="button" className="btn-ghost" onClick={reset}>
                      <X className="h-4 w-4" /> Back to selection
                    </button>
                  </div>
                )}
              </>
            ) : (
              <PlaylistSkeleton />
            )
          ) : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary py-2" onClick={() => setSelected(new Set(available.map((v) => v.id)))}>
                    <SquareCheck className="h-4 w-4" /> Select all
                  </button>
                  <button type="button" className="btn-secondary py-2" onClick={() => setSelected(new Set())}>
                    <X className="h-4 w-4" /> Deselect all
                  </button>
                </div>
                <form
                  className="flex flex-wrap items-center gap-2 text-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyRange();
                  }}
                >
                  <span className="text-zinc-600 dark:text-zinc-300">Videos</span>
                  <input
                    type="number"
                    min={1}
                    max={playlist.videos.length}
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    aria-label="Range start"
                    className="h-10 w-20 rounded-lg border border-zinc-200 bg-white px-2 text-center tabular-nums focus:border-accent focus:outline-none dark:border-zinc-700 dark:bg-zinc-950/60"
                  />
                  <span className="text-zinc-600 dark:text-zinc-300">to</span>
                  <input
                    type="number"
                    min={1}
                    max={playlist.videos.length}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    aria-label="Range end"
                    className="h-10 w-20 rounded-lg border border-zinc-200 bg-white px-2 text-center tabular-nums focus:border-accent focus:outline-none dark:border-zinc-700 dark:bg-zinc-950/60"
                  />
                  <button type="submit" className="btn-secondary py-2">
                    <ListChecks className="h-4 w-4" /> Select range
                  </button>
                </form>
              </div>

              <PlaylistList videos={playlist.videos} selected={selected} onToggle={toggle} />

              <ResolutionSelector
                label="Resolution for all videos"
                choices={PLAYLIST_CHOICES}
                value={quality}
                onChange={setQuality}
              />
              <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                If a video doesn’t have this resolution, the next best lower one is used and marked with a “fallback” badge.
              </p>

              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <FormatSelector
                  value={format}
                  onChange={setFormat}
                  disabled={isAudio}
                  note={isAudio ? 'Audio is saved as MP3.' : null}
                />
                <div className="flex flex-col items-stretch gap-1 sm:items-end">
                  <button
                    type="button"
                    className="btn-primary h-12 px-8 text-base"
                    onClick={() => void start()}
                    disabled={selectedVideos.length === 0 || starting}
                  >
                    <Download className="h-5 w-5" /> Download Selected ({selectedVideos.length})
                  </button>
                  <span className="text-center text-xs text-zinc-500 sm:text-right dark:text-zinc-400">
                    {selectedVideos.length} of {available.length} selected · {formatDuration(totalDuration)} total
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
