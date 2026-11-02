import { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { CHANNEL_TABS, parseChannelUrl, type ChannelTab } from '../utils/validateUrl.js';
import { runYtdlpJson } from '../services/ytdlp.js';
import { FLAT_LISTING_ARGS, mapEntries, pickAvatar, type ListedVideo, type RawListing } from '../services/listing.js';
import { abortOnClose } from './helpers.js';

export interface ChannelPage {
  id: string | null;
  name: string;
  handle: string | null;
  url: string;
  avatar: string | null;
  subscriberCount: number | null;
  tab: ChannelTab;
  page: number;
  pageSize: number;
  hasMore: boolean;
  videos: ListedVideo[];
}

export function channelRouter(limiter: RateLimitRequestHandler) {
  const router = Router();

  /**
   * POST /api/channel { url, tab?: "videos"|"shorts"|"streams", page?: 1-based }
   * Lists a channel's public uploads, newest first, `MAX_PLAYLIST_SIZE` per page.
   * Private videos are never listed: YouTube only shows them to the channel owner.
   */
  router.post('/channel', limiter, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tab = (body.tab ?? 'videos') as ChannelTab;
    if (!CHANNEL_TABS.includes(tab)) {
      throw new AppError(400, 'INVALID_REQUEST', `tab must be one of: ${CHANNEL_TABS.join(', ')}.`);
    }
    const page = Number(body.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 50) {
      throw new AppError(400, 'INVALID_REQUEST', 'page must be an integer between 1 and 50.');
    }
    const { url } = parseChannelUrl(body.url, tab);
    const size = config.maxPlaylistSize;
    const first = (page - 1) * size + 1;
    const last = page * size;

    let raw: RawListing;
    try {
      raw = await runYtdlpJson<RawListing>(
        [...FLAT_LISTING_ARGS, '--playlist-items', `${first}:${last}`, '--', url],
        { signal: abortOnClose(req, res), timeoutMs: 120_000 },
      );
    } catch (err) {
      if (err instanceof AppError && err.code === 'UNAVAILABLE') {
        throw new AppError(404, 'UNAVAILABLE', 'Channel not found. Check the link, e.g. youtube.com/@channelname.');
      }
      throw err;
    }
    const videos = mapEntries(raw.entries);
    if (videos.length === 0 && page === 1) {
      const what = tab === 'shorts' ? 'Shorts' : tab === 'streams' ? 'live streams' : 'public videos';
      throw new AppError(404, 'UNAVAILABLE', `This channel has no ${what}, or the channel doesn’t exist.`);
    }

    const result: ChannelPage = {
      id: raw.channel_id ?? null,
      name: raw.channel ?? raw.uploader ?? raw.title?.replace(/ - (Videos|Shorts|Live)$/i, '') ?? 'Channel',
      handle: raw.uploader_id?.startsWith('@') ? raw.uploader_id : null,
      url: raw.uploader_url ?? raw.channel_url ?? url.replace(/\/(videos|shorts|streams)$/, ''),
      avatar: pickAvatar(raw.thumbnails),
      subscriberCount: raw.channel_follower_count ?? null,
      tab,
      page,
      pageSize: size,
      hasMore: (raw.entries?.length ?? 0) >= size,
      videos,
    };
    res.json(result);
  });

  return router;
}
