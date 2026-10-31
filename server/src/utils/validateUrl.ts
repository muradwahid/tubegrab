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

export function videoUrlFromId(id: string): string {
  if (!VIDEO_ID_RE.test(id)) throw new AppError(400, 'INVALID_REQUEST', `Invalid video ID: ${id}`);
  return `https://www.youtube.com/watch?v=${id}`;
}
