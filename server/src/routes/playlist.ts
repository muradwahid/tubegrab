import { Router } from 'express';
import archiver from 'archiver';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { parsePlaylistUrl, VIDEO_ID_RE } from '../utils/validateUrl.js';
import { sanitizeFilename } from '../utils/sanitize.js';
import { openSse } from '../utils/sse.js';
import { runYtdlpJson } from '../services/ytdlp.js';
import { PLAYLIST_QUALITIES } from '../services/formats.js';
import { createBatch, getBatch, subscribe } from '../services/jobs.js';
import { abortOnClose, param, parseQualityAndFormat } from './helpers.js';

interface RawThumb {
  url?: string;
  width?: number;
  height?: number;
}
interface RawEntry {
  id?: string;
  title?: string;
  duration?: number | null;
  thumbnails?: RawThumb[];
  channel?: string;
  uploader?: string;
  availability?: string | null;
  live_status?: string | null;
}
interface RawPlaylist {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  playlist_count?: number;
  entries?: RawEntry[];
}

export interface PlaylistVideo {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string;
  channel: string | null;
  /** Private/deleted/live entries can't be downloaded. */
  unavailable: boolean;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  channel: string | null;
  totalCount: number;
  truncated: boolean;
  maxSize: number;
  videos: PlaylistVideo[];
}

function pickThumb(entry: RawEntry, id: string): string {
  const thumbs = (entry.thumbnails ?? []).filter((t) => t.url);
  const good = thumbs.find((t) => (t.width ?? 0) >= 320) ?? thumbs.at(-1);
  return good?.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

export function playlistRouter(limiter: RateLimitRequestHandler) {
  const router = Router();

  router.post('/playlist', limiter, async (req, res) => {
    const { id, url } = parsePlaylistUrl(req.body?.url);
    const raw = await runYtdlpJson<RawPlaylist>(
      ['--flat-playlist', '--dump-single-json', '--playlist-end', String(config.maxPlaylistSize), '--', url],
      { signal: abortOnClose(req, res), timeoutMs: 120_000 },
    );
    const videos: PlaylistVideo[] = (raw.entries ?? [])
      .filter((e): e is RawEntry & { id: string } => typeof e.id === 'string' && VIDEO_ID_RE.test(e.id))
      .map((e) => {
        const title = e.title ?? 'Untitled';
        const unavailable =
          /^\[(private|deleted) video\]$/i.test(title) ||
          ['private', 'needs_auth', 'subscriber_only', 'premium_only'].includes(e.availability ?? '') ||
          e.live_status === 'is_live' ||
          e.live_status === 'is_upcoming';
        return {
          id: e.id,
          title,
          duration: e.duration ?? null,
          thumbnail: pickThumb(e, e.id),
          channel: e.channel ?? e.uploader ?? null,
          unavailable,
        };
      });
    if (videos.length === 0) {
      throw new AppError(404, 'UNAVAILABLE', 'This playlist is empty or unavailable.');
    }
    const totalCount = Math.max(raw.playlist_count ?? videos.length, videos.length);
    const info: PlaylistInfo = {
      id: raw.id ?? id,
      title: raw.title ?? 'Untitled playlist',
      channel: raw.channel ?? raw.uploader ?? null,
      totalCount,
      truncated: totalCount > videos.length,
      maxSize: config.maxPlaylistSize,
      videos,
    };
    res.json(info);
  });

  router.post('/playlist/download', limiter, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { quality, format } = parseQualityAndFormat(body);
    if (!PLAYLIST_QUALITIES.includes(quality)) {
      throw new AppError(400, 'INVALID_REQUEST', `Playlist resolution must be one of: ${PLAYLIST_QUALITIES.join(', ')}.`);
    }
    if (!Array.isArray(body.videos) || body.videos.length === 0) {
      throw new AppError(400, 'INVALID_REQUEST', 'Select at least one video.');
    }
    if (body.videos.length > config.maxPlaylistSize) {
      throw new AppError(
        400,
        'PLAYLIST_TOO_LARGE',
        `You can download at most ${config.maxPlaylistSize} videos at once.`,
      );
    }
    // Accept either ["id", ...] or [{ id, title }, ...].
    const seen = new Set<string>();
    const videos: Array<{ id: string; title: string | null }> = [];
    for (const v of body.videos as unknown[]) {
      const id = typeof v === 'string' ? v : (v as { id?: unknown })?.id;
      const title = typeof v === 'object' && v ? (v as { title?: unknown }).title : null;
      if (typeof id !== 'string' || !VIDEO_ID_RE.test(id)) {
        throw new AppError(400, 'INVALID_REQUEST', 'The video list contains an invalid video ID.');
      }
      if (seen.has(id)) continue;
      seen.add(id);
      videos.push({ id, title: typeof title === 'string' ? title.slice(0, 300) : null });
    }
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : null;
    const batch = createBatch(videos, quality, format, title);
    res.status(202).json({ batchId: batch.id });
  });

  router.get('/playlist/progress/:batchId', (req, res) => {
    const batch = getBatch(param(req, 'batchId'));
    if (!batch) throw new AppError(404, 'NOT_FOUND', 'Playlist download not found or expired.');
    const sse = openSse(req, res);
    sse.send('progress', batch.snapshot);
    const onUpdate = (s: unknown) => sse.send('progress', s);
    batch.on('update', onUpdate);
    const unsubscribe = subscribe(batch.id, () => batch.cancel());
    sse.onClose(() => {
      batch.off('update', onUpdate);
      unsubscribe();
    });
  });

  router.delete('/playlist/:batchId', (req, res) => {
    const batch = getBatch(param(req, 'batchId'));
    if (!batch) throw new AppError(404, 'NOT_FOUND', 'Playlist download not found or expired.');
    batch.cancel();
    res.json({ ok: true });
  });

  router.post('/playlist/:batchId/retry/:videoId', limiter, (req, res) => {
    const batch = getBatch(param(req, 'batchId'));
    const videoId = req.params.videoId;
    if (!batch) throw new AppError(404, 'NOT_FOUND', 'Playlist download not found or expired.');
    if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId) || !batch.retry(videoId)) {
      throw new AppError(409, 'INVALID_REQUEST', 'Only failed or cancelled videos can be retried.');
    }
    res.json({ ok: true });
  });

  router.get('/playlist/zip/:batchId', (req, res) => {
    const batch = getBatch(param(req, 'batchId'));
    if (!batch) throw new AppError(404, 'NOT_FOUND', 'Playlist download not found or expired.');
    const done = batch.items
      .map((i) => i.job)
      .filter((j): j is NonNullable<typeof j> => !!j && j.snapshot.status === 'done' && !!j.filePath);
    if (done.length === 0) throw new AppError(409, 'NOT_READY', 'No completed files to zip yet.');

    const zipName = `${sanitizeFilename(batch.title ?? 'TubeGrab playlist', 'playlist')}.zip`;
    res.attachment(zipName);
    res.setHeader('Content-Type', 'application/zip');

    // Videos are already compressed; "store" avoids burning CPU for ~0% gain.
    const archive = archiver('zip', { store: true });
    archive.on('warning', (err) => console.warn('[zip]', err));
    archive.on('error', (err) => {
      console.error('[zip]', err);
      res.destroy(err);
    });
    res.on('close', () => {
      if (!res.writableFinished) archive.abort();
    });
    archive.pipe(res);

    const used = new Set<string>();
    const width = String(batch.items.length).length;
    for (const item of batch.items) {
      const job = item.job;
      if (!job || !done.includes(job) || !job.filePath) continue;
      let name = `${String(item.index + 1).padStart(width, '0')} - ${job.snapshot.filename ?? `${item.videoId}.mp4`}`;
      while (used.has(name.toLowerCase())) name = name.replace(/(\.[^.]+)$/, ` (${item.videoId})$1`);
      used.add(name.toLowerCase());
      archive.file(job.filePath, { name });
    }
    void archive.finalize();
  });

  return router;
}
