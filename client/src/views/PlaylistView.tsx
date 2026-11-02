import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, RotateCcw, SquareCheck, X } from 'lucide-react';
import { api, BackendUnreachableError, errorMessage } from '../api/client';
import { useToast } from '../hooks/useToast';
import { useBatchDownload } from '../hooks/useBatchDownload';
import type { HistoryItem, PlaylistInfo, PlaylistVideo } from '../types';
import { UrlInput } from '../components/UrlInput';
import { Banner } from '../components/Banner';
import { PlaylistSkeleton } from '../components/Skeleton';
import { PlaylistList } from '../components/PlaylistList';
import { BatchOptions, BatchQueue } from '../components/BatchOptions';

interface Props {
  url: string;
  onUrlChange: (url: string) => void;
  fetchSignal: number;
  onDownloaded: (item: Omit<HistoryItem, 'id' | 'createdAt'>) => void;
}

export function PlaylistView({ url, onUrlChange, fetchSignal, onDownloaded }: Props) {
  const toast = useToast();
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const dl = useBatchDownload({
    label: 'Playlist',
    onDownloaded,
    getHistorySource: () =>
      playlist
        ? { kind: 'playlist', title: playlist.title, url, thumbnail: playlist.videos[0]?.thumbnail ?? null }
        : null,
  });

  const available = useMemo(() => playlist?.videos.filter((v) => !v.unavailable) ?? [], [playlist]);
  const videoMap = useMemo(
    () => new Map<string, PlaylistVideo>((playlist?.videos ?? []).map((v) => [v.id, v])),
    [playlist],
  );
  const selectedVideos = useMemo(() => available.filter((v) => selected.has(v.id)), [available, selected]);

  const fetchPlaylist = useCallback(
    async (target: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFetchError(null);
      setPlaylist(null);
      dl.reset();
      try {
        const result = await api.playlist(target, controller.signal);
        setPlaylist(result);
        setSelected(new Set(result.videos.filter((v) => !v.unavailable).map((v) => v.id)));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  useEffect(() => {
    if (fetchSignal > 0 && url) void fetchPlaylist(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSignal]);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  const rangeInputClass =
    'h-10 w-20 rounded-lg border border-zinc-200 bg-white px-2 text-center tabular-nums focus:border-accent focus:outline-none dark:border-zinc-700 dark:bg-zinc-950/60';

  return (
    <div className="space-y-6">
      <UrlInput
        value={url}
        onChange={onUrlChange}
        onSubmit={(u) => void fetchPlaylist(u)}
        submitLabel="Fetch Playlist"
        placeholder="https://www.youtube.com/playlist?list=…"
        loading={loading}
        disabled={dl.running}
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

          {dl.active ? (
            <BatchQueue dl={dl} videos={videoMap} />
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
                    className={rangeInputClass}
                  />
                  <span className="text-zinc-600 dark:text-zinc-300">to</span>
                  <input
                    type="number"
                    min={1}
                    max={playlist.videos.length}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    aria-label="Range end"
                    className={rangeInputClass}
                  />
                  <button type="submit" className="btn-secondary py-2">
                    <ListChecks className="h-4 w-4" /> Select range
                  </button>
                </form>
              </div>

              <PlaylistList videos={playlist.videos} selected={selected} onToggle={toggle} />

              <BatchOptions
                dl={dl}
                selected={selectedVideos}
                availableCount={available.length}
                maxCount={playlist.maxSize}
                onStart={() =>
                  void dl.start(
                    selectedVideos.map((v) => ({ id: v.id, title: v.title })),
                    playlist.title,
                  )
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
