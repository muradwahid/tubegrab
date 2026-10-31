import { Router } from 'express';
import { AppError } from '../utils/errors.js';
import { parseVideoUrl } from '../utils/validateUrl.js';
import { runYtdlpJson } from '../services/ytdlp.js';
import { buildQualityOptions, type QualityOption, type RawFormat } from '../services/formats.js';
import { abortOnClose } from './helpers.js';

interface RawVideoInfo {
  id: string;
  title?: string;
  fulltitle?: string;
  thumbnail?: string;
  channel?: string;
  uploader?: string;
  channel_url?: string;
  uploader_url?: string;
  duration?: number | null;
  view_count?: number | null;
  upload_date?: string | null;
  live_status?: string | null;
  is_live?: boolean | null;
  formats?: RawFormat[];
}

export interface VideoInfo {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  channel: string;
  channelUrl: string | null;
  duration: number | null;
  viewCount: number | null;
  uploadDate: string | null;
  qualities: QualityOption[];
}

export const infoRouter = Router();

infoRouter.post('/info', async (req, res) => {
  const { id, url } = parseVideoUrl(req.body?.url);
  const raw = await runYtdlpJson<RawVideoInfo>(['--dump-json', '--no-playlist', '--skip-download', '--', url], {
    signal: abortOnClose(req, res),
  });

  if (raw.is_live || raw.live_status === 'is_live' || raw.live_status === 'is_upcoming') {
    throw new AppError(422, 'LIVE_NOT_SUPPORTED', 'Live streams and upcoming premieres cannot be downloaded.');
  }

  const qualities = buildQualityOptions(raw.formats ?? [], raw.duration ?? null);
  if (qualities.length === 0) {
    throw new AppError(404, 'UNAVAILABLE', 'No downloadable formats were found for this video.');
  }

  const info: VideoInfo = {
    id: raw.id ?? id,
    url,
    title: raw.title ?? raw.fulltitle ?? 'Untitled video',
    thumbnail: raw.thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    channel: raw.channel ?? raw.uploader ?? 'Unknown channel',
    channelUrl: raw.channel_url ?? raw.uploader_url ?? null,
    duration: raw.duration ?? null,
    viewCount: raw.view_count ?? null,
    uploadDate: raw.upload_date ?? null,
    qualities,
  };
  res.json(info);
});
