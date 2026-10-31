import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Running on Vercel (read-only filesystem except /tmp, behind Vercel's proxy). */
const onVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL);

/**
 * Set by server/Dockerfile. The container only runs on hosting platforms
 * (Vercel, Render, Railway), which always sit behind a reverse proxy.
 */
const inContainer = process.env.TUBEGRAB_CONTAINER === '1';

function int(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`Invalid value for ${name}: "${raw}" (expected integer >= ${min})`);
  }
  return n;
}

/**
 * yt-dlp cookies from YTDLP_COOKIES: the text of a Netscape cookies.txt file
 * (multi-line), or the same text base64-encoded. Lets yt-dlp pass YouTube's
 * "confirm you're not a bot" check, which cloud IPs (Vercel, Render…) often hit.
 */
function cookiesFromEnv(): string | null {
  const raw = process.env.YTDLP_COOKIES?.trim();
  if (!raw) return null;
  const text = raw.includes('\t') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  if (!text.includes('\t')) {
    console.warn('[tubegrab] ⚠ YTDLP_COOKIES is set but is not a Netscape cookies.txt (or base64 of one); ignoring it.');
    return null;
  }
  return text.endsWith('\n') ? text : `${text}\n`;
}

export const config = {
  port: int('PORT', 4000),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  maxPlaylistSize: int('MAX_PLAYLIST_SIZE', 100),
  onVercel,
  inContainer,
  downloadDir: path.resolve(
    serverRoot,
    process.env.DOWNLOAD_DIR ?? (onVercel ? path.join(os.tmpdir(), 'tubegrab') : './downloads'),
  ),
  ytdlpPath: process.env.YTDLP_PATH?.trim() || 'yt-dlp',
  ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
  fileTtlMs: int('FILE_TTL_MINUTES', 30) * 60_000,
  rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 10),
  // Behind a platform proxy we must trust X-Forwarded-For, otherwise every visitor
  // shares one rate-limit bucket. This holds even if TRUST_PROXY=0 was copied from a local .env.
  trustProxy:
    inContainer || onVercel || process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  ytdlpCookies: cookiesFromEnv(),
  /** Optional proxy for yt-dlp, e.g. http://user:pass@host:port (helps with IP-based blocks). */
  ytdlpProxy: process.env.YTDLP_PROXY?.trim() || null,
  /** Optional yt-dlp --extractor-args, e.g. "youtube:player_client=tv_simply,mweb". */
  ytdlpExtractorArgs: process.env.YTDLP_EXTRACTOR_ARGS?.trim() || null,
  /** Player clients tried on YouTube bot checks (comma-separated, "off" disables). */
  ytdlpClientFallback: process.env.YTDLP_CLIENT_FALLBACK?.trim().toLowerCase() || null,
  /**
   * Progress streams are ended after this many seconds and the browser
   * reconnects automatically. Keeps each request under serverless request
   * limits (Vercel: 300s). 0 disables.
   */
  sseMaxSeconds: int('SSE_MAX_SECONDS', 270, 0),
  /** Max simultaneous yt-dlp downloads per playlist batch. */
  batchConcurrency: 2,
} as const;
