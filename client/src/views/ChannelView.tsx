import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarRange,
  ChevronsDown,
  ExternalLink,
  LoaderCircle,
  Lock,
  RotateCcw,
  SquareCheck,
  X,
} from 'lucide-react';
import { api, BackendUnreachableError, errorMessage } from '../api/client';
import { useToast } from '../hooks/useToast';
import { useBatchDownload } from '../hooks/useBatchDownload';
import type { ChannelPage, ChannelTab, HistoryItem, PlaylistVideo } from '../types';
import { cn, uploadRange } from '../utils/format';
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

type ChannelMeta = Omit<ChannelPage, 'videos' | 'page' | 'hasMore'>;
type Sort = 'newest' | 'oldest';

const TABS: Array<{ id: ChannelTab; label: string }> = [
  { id: 'videos', label: 'Videos' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'streams', label: 'Live' },
];

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function ChannelView({ url, onUrlChange, fetchSignal, onDownloaded }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<ChannelTab>('videos');
  const [channel, setChannel] = useState<ChannelMeta | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  /** The URL the current list was loaded from (Load more must use it, not the edited input). */
  const loadedUrlRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const dl = useBatchDownload({
    label: 'Channel',
    onDownloaded,
    getHistorySource: () =>
      channel
        ? { kind: 'channel', title: channel.name, url: loadedUrlRef.current, thumbnail: channel.avatar ?? videos[0]?.thumbnail ?? null }
        : null,
  });

  const fetchChannel = useCallback(
    async (target: string, whichTab: ChannelTab) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFetchError(null);
      setChannel(null);
      setVideos([]);
      setSelected(new Set());
      dl.reset();
      try {
        const result = await api.channel(target, whichTab, 1, controller.signal);
        const { videos: list, page: p, hasMore: more, ...meta } = result;
        loadedUrlRef.current = target;
        setChannel(meta);
        setVideos(list);
        setPage(p);
        setHasMore(more);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = errorMessage(err);
        setFetchError(msg);
        if (!(err instanceof BackendUnreachableError)) toast.error('Couldn’t fetch channel', msg);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  const loadMore = async () => {
    if (!channel || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.channel(loadedUrlRef.current, channel.tab, page + 1);
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...result.videos.filter((v) => !seen.has(v.id))];
      });
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (err) {
      if (!(err instanceof BackendUnreachableError)) toast.error('Couldn’t load more videos', errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (fetchSignal > 0 && url) void fetchChannel(url, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSignal]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const switchTab = (next: ChannelTab) => {
    setTab(next);
    if (channel && loadedUrlRef.current) void fetchChannel(loadedUrlRef.current, next);
  };

  const dateFilterOn = dateFrom !== '' || dateTo !== '';

  // Date filter + sort. Videos without a date (Shorts) are hidden while a date filter is on.
  const shown = useMemo(() => {
    const list = videos.filter((v) => {
      if (!dateFilterOn) return true;
      const range = uploadRange(v.uploadDate);
      if (!range) return false;
      // Keep every video whose possible upload range overlaps the chosen dates.
      return (!dateFrom || range.to >= dateFrom) && (!dateTo || range.from <= dateTo);
    });
    if (sort === 'oldest') list.reverse();
    return list;
  }, [videos, dateFilterOn, dateFrom, dateTo, sort]);

  const undatedHidden = dateFilterOn ? videos.filter((v) => !v.uploadDate).length : 0;
  const shownAvailable = useMemo(() => shown.filter((v) => !v.unavailable), [shown]);
  const selectedVideos = useMemo(() => shownAvailable.filter((v) => selected.has(v.id)), [shownAvailable, selected]);
  const videoMap = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);
  const oldestLoaded = uploadRange(videos.at(-1)?.uploadDate)?.from;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const dateInputClass =
    'h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums focus:border-accent focus:outline-none dark:border-zinc-700 dark:bg-zinc-950/60';

  return (
    <div className="space-y-6">
      <UrlInput
        value={url}
        onChange={onUrlChange}
        onSubmit={(u) => void fetchChannel(u, tab)}
        submitLabel="Fetch Channel"
        placeholder="https://www.youtube.com/@channelname"
        loading={loading}
        disabled={dl.running}
        onPasteError={(m) => toast.info(m)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="radiogroup" aria-label="Channel section" className="inline-flex self-start rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tab === t.id}
              disabled={loading || dl.running}
              onClick={() => switchTab(t.id)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed',
                tab === t.id
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Only public uploads are listed. YouTube shows private videos only to the channel owner.
        </p>
      </div>

      {loading && <PlaylistSkeleton />}

      {fetchError && !loading && (
        <Banner
          variant="error"
          title="Couldn’t load this channel"
          action={
            url.trim() ? (
              <button type="button" className="btn-secondary py-2" onClick={() => void fetchChannel(url.trim(), tab)}>
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
            ) : null
          }
        >
          {fetchError}
        </Banner>
      )}

      {channel && !loading && (
        <div className="animate-fade-in space-y-6">
          <div className="flex items-center gap-4">
            {channel.avatar ? (
              <img
                src={channel.avatar}
                alt=""
                referrerPolicy="no-referrer"
                className="h-14 w-14 shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-800"
              />
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-white">
                {channel.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 truncate text-lg font-bold sm:text-xl">
                <span className="truncate">{channel.name}</span>
                <a href={channel.url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-accent" aria-label="Open channel on YouTube">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </h2>
              <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                {[
                  channel.handle,
                  channel.subscriberCount !== null ? `${compact.format(channel.subscriberCount)} subscribers` : null,
                  `${videos.length}${hasMore ? '+' : ''} ${TABS.find((t) => t.id === channel.tab)?.label.toLowerCase()} loaded`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          {dl.active ? (
            <BatchQueue dl={dl} videos={videoMap} />
          ) : (
            <>
              <div className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <CalendarRange className="h-4 w-4 text-accent" aria-hidden />
                    <span className="text-zinc-600 dark:text-zinc-300">Uploaded from</span>
                    <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} aria-label="Uploaded from" className={dateInputClass} />
                    <span className="text-zinc-600 dark:text-zinc-300">to</span>
                    <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} aria-label="Uploaded to" className={dateInputClass} />
                    {dateFilterOn && (
                      <button type="button" className="btn-ghost px-2 py-1.5" aria-label="Clear date filter" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                        <X className="h-4 w-4" /> Clear
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary self-start py-2"
                    onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
                  >
                    {sort === 'newest' ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
                    {sort === 'newest' ? 'Newest first' : 'Oldest first'}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  YouTube lists uploads as “3 weeks ago” / “1 month ago”, so older dates are ranges (hover a date to see it). The filter keeps every video that could fall in your dates.
                  {undatedHidden > 0 && ` ${undatedHidden} video${undatedHidden === 1 ? '' : 's'} without a date (Shorts) are hidden by the date filter.`}
                  {dateFrom && hasMore && oldestLoaded && oldestLoaded > dateFrom &&
                    ' Older videos may match too — use “Load older videos” below.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary py-2" onClick={() => setSelected(new Set(shownAvailable.map((v) => v.id)))}>
                    <SquareCheck className="h-4 w-4" /> Select all shown ({shownAvailable.length})
                  </button>
                  <button type="button" className="btn-secondary py-2" onClick={() => setSelected(new Set())}>
                    <X className="h-4 w-4" /> Deselect all
                  </button>
                </div>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Showing {shown.length} of {videos.length}
                </span>
              </div>

              {shown.length > 0 ? (
                <PlaylistList videos={shown} selected={selected} onToggle={toggle} hideChannel showIndex={false} />
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  No loaded videos match this date range{hasMore ? ' — try “Load older videos”.' : '.'}
                </p>
              )}

              {hasMore && (
                <div className="flex justify-center">
                  <button type="button" className="btn-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ChevronsDown className="h-4 w-4" />}
                    {loadingMore ? 'Loading…' : `Load older videos (next ${channel.pageSize})`}
                  </button>
                </div>
              )}

              <BatchOptions
                dl={dl}
                selected={selectedVideos}
                availableCount={shownAvailable.length}
                maxCount={channel.pageSize}
                onStart={() =>
                  void dl.start(
                    selectedVideos.map((v) => ({ id: v.id, title: v.title })),
                    `${channel.name}${channel.tab === 'videos' ? '' : ` (${channel.tab})`}`,
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
