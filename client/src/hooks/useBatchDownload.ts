import { useRef, useState } from 'react';
import { api, ApiError, BackendUnreachableError, errorMessage } from '../api/client';
import { useEventSource } from './useEventSource';
import { useToast } from './useToast';
import type { BatchSnapshot, HistoryItem, OutputFormat, Quality } from '../types';

interface HistorySource {
  kind: 'playlist' | 'channel';
  title: string;
  url: string;
  thumbnail: string | null;
}

interface Options {
  onDownloaded: (item: Omit<HistoryItem, 'id' | 'createdAt'>) => void;
  /** Describes what was downloaded, for the history entry when a run finishes. */
  getHistorySource: () => HistorySource | null;
  /** Used in toasts, e.g. "Playlist" or "Channel". */
  label: string;
}

/**
 * Multi-video download state shared by the Playlist and Channel tabs:
 * starts a server batch, follows its SSE progress, and handles cancel/retry.
 */
export function useBatchDownload({ onDownloaded, getHistorySource, label }: Options) {
  const toast = useToast();
  const [quality, setQuality] = useState<Quality>('1080p');
  const [format, setFormat] = useState<OutputFormat>('mp4');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchSnapshot | null>(null);
  /** Bumped to re-open the SSE stream after a retry on a finished batch. */
  const [streamKey, setStreamKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const announcedRef = useRef<string | null>(null);
  const sourceRef = useRef(getHistorySource);
  sourceRef.current = getHistorySource;

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
          toast.success(`${label} downloaded`, `${snapshot.completed} videos ready — grab the ZIP or individual files.`);
        } else {
          toast.info(`${label} finished with errors`, `${snapshot.completed} downloaded, ${snapshot.failed} failed.`);
        }
        const source = sourceRef.current();
        if (source && snapshot.completed > 0) {
          onDownloaded({
            ...source,
            detail: `${snapshot.completed} video${snapshot.completed === 1 ? '' : 's'} · ${snapshot.quality}`,
            filename: null,
          });
        }
      }
      return true;
    },
    () => toast.error('Lost connection to the server', 'Progress updates stopped.'),
  );

  const start = async (videos: Array<{ id: string; title: string }>, title: string) => {
    if (videos.length === 0) return;
    setStarting(true);
    try {
      const { batchId: id } = await api.startPlaylist(videos, quality, format, title);
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
      toast.info(`${label} download cancelled`);
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

  /** Leave the queue view and go back to selecting videos. */
  const reset = () => {
    setBatch(null);
    setBatchId(null);
  };

  return {
    quality,
    setQuality,
    format,
    setFormat,
    batchId,
    batch,
    starting,
    running: starting || batch?.status === 'running',
    /** True while a batch exists (running or finished): show the queue instead of the selection. */
    active: batchId !== null,
    retrying,
    start,
    cancel,
    retry,
    reset,
  };
}

export type BatchDownload = ReturnType<typeof useBatchDownload>;
