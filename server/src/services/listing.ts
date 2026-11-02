/**
 * Shared parsing of yt-dlp "--flat-playlist" listings (playlists and channels).
 */
import { VIDEO_ID_RE } from '../utils/validateUrl.js';

export interface RawThumb {
  url?: string;
  width?: number;
  height?: number;
  id?: string;
}

export interface RawEntry {
  id?: string;
  title?: string;
  duration?: number | null;
  thumbnails?: RawThumb[];
  channel?: string;
  uploader?: string;
  availability?: string | null;
  live_status?: string | null;
  view_count?: number | null;
  upload_date?: string | null;
  timestamp?: number | null;
  release_timestamp?: number | null;
}

export interface RawListing {
  id?: string;
  title?: string;
  channel?: string;
  channel_id?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel_url?: string;
  channel_follower_count?: number | null;
  playlist_count?: number | null;
  thumbnails?: RawThumb[];
  entries?: RawEntry[];
}

export interface ListedVideo {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string;
  channel: string | null;
  /** YYYYMMDD. In flat listings YouTube only gives relative text ("3 weeks ago"), so this is approximate. */
  uploadDate: string | null;
  viewCount: number | null;
  /** Private/deleted/live entries can't be downloaded. */
  unavailable: boolean;
}

/** yt-dlp args that make flat listings include an (approximate) upload date. */
export const FLAT_LISTING_ARGS = ['--flat-playlist', '--dump-single-json', '--extractor-args', 'youtubetab:approximate_date'];

function pickThumb(entry: RawEntry, id: string): string {
  const thumbs = (entry.thumbnails ?? []).filter((t) => t.url);
  const good = thumbs.find((t) => (t.width ?? 0) >= 320) ?? thumbs.at(-1);
  return good?.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

function toYmd(entry: RawEntry): string | null {
  if (entry.upload_date && /^\d{8}$/.test(entry.upload_date)) return entry.upload_date;
  const ts = entry.timestamp ?? entry.release_timestamp;
  if (!ts) return null;
  return new Date(ts * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

export function mapEntries(entries: RawEntry[] | undefined): ListedVideo[] {
  return (entries ?? [])
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
        uploadDate: toYmd(e),
        viewCount: e.view_count ?? null,
        unavailable,
      };
    });
}

/** Best square-ish avatar from a channel listing's thumbnails. */
export function pickAvatar(thumbs: RawThumb[] | undefined): string | null {
  const list = (thumbs ?? []).filter((t) => t.url);
  const avatar =
    list.find((t) => t.id === 'avatar_uncropped') ??
    list.find((t) => t.width && t.height && t.width === t.height && t.width <= 900);
  return avatar?.url ?? null;
}
