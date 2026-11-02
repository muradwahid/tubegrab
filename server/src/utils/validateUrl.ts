import { AppError } from './errors.js';

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

function parseAllowed(input: unknown): URL {
  if (typeof input !== 'string' || input.trim() === '' || input.length > 2048) {
    throw new AppError(400, 'INVALID_URL', 'Please provide a YouTube URL.');
  }
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'INVALID_URL', 'That isn’t a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new AppError(
      400,
      'INVALID_URL',
      'Only youtube.com, youtu.be and music.youtube.com links are supported.',
    );
  }
  return url;
}

function extractVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host.endsWith('youtu.be')) {
    return url.pathname.split('/')[1] ?? null;
  }
  const v = url.searchParams.get('v');
  if (v) return v;
  const match = url.pathname.match(/^\/(?:shorts|embed|live|v|e)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

/**
 * Validate a single-video URL and return a canonical watch URL built only from
 * the validated video ID, so nothing user-controlled reaches yt-dlp verbatim.
 */
export function parseVideoUrl(input: unknown): { id: string; url: string } {
  const url = parseAllowed(input);
  const id = extractVideoId(url);
  if (!id || !VIDEO_ID_RE.test(id)) {
    if (url.searchParams.get('list')) {
      throw new AppError(
        400,
        'INVALID_URL',
        'This is a playlist link without a specific video. Use Playlist mode instead.',
      );
    }
    throw new AppError(400, 'INVALID_URL', 'Could not find a video ID in that link.');
  }
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** Validate a playlist URL and return a canonical playlist URL. */
export function parsePlaylistUrl(input: unknown): { id: string; url: string } {
  const url = parseAllowed(input);
  const list = url.searchParams.get('list');
  if (!list || !PLAYLIST_ID_RE.test(list)) {
    throw new AppError(400, 'INVALID_URL', 'That link doesn’t contain a playlist (missing "list=").');
  }
  return { id: list, url: `https://www.youtube.com/playlist?list=${list}` };
}

export const CHANNEL_TABS = ['videos', 'shorts', 'streams'] as const;
export type ChannelTab = (typeof CHANNEL_TABS)[number];

const HANDLE_RE = /^@[\p{L}\p{N}._-]{1,100}$/u;
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const LEGACY_NAME_RE = /^[\p{L}\p{N}._-]{1,100}$/u;

/**
 * Validate a channel URL (@handle, /channel/UC…, /c/name, /user/name) and
 * return a canonical tab URL built only from the validated identifier.
 */
export function parseChannelUrl(input: unknown, tab: ChannelTab = 'videos'): { key: string; url: string } {
  const url = parseAllowed(input);
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  const [first, second] = parts;
  let path: string | null = null;
  if (first && HANDLE_RE.test(first)) {
    path = `/${encodeURIComponent(first).replace(/%40/g, '@')}`;
  } else if (first === 'channel' && second && CHANNEL_ID_RE.test(second)) {
    path = `/channel/${second}`;
  } else if ((first === 'c' || first === 'user') && second && LEGACY_NAME_RE.test(second)) {
    path = `/${first}/${encodeURIComponent(second)}`;
  }
  if (!path) {
    if (url.searchParams.get('v') || url.hostname.toLowerCase().endsWith('youtu.be')) {
      throw new AppError(400, 'INVALID_URL', 'That’s a video link. Paste a channel link like youtube.com/@channelname.');
    }
    throw new AppError(
      400,
      'INVALID_URL',
      'That doesn’t look like a channel link. Use youtube.com/@name or youtube.com/channel/UC….',
    );
  }
  return { key: path, url: `https://www.youtube.com${path}/${tab}` };
}

export function videoUrlFromId(id: string): string {
  if (!VIDEO_ID_RE.test(id)) throw new AppError(400, 'INVALID_REQUEST', `Invalid video ID: ${id}`);
  return `https://www.youtube.com/watch?v=${id}`;
}
