import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Running on Vercel (read-only filesystem except /tmp, behind Vercel's proxy). */
const onVercel = !!process.env.VERCEL;

function int(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`Invalid value for ${name}: "${raw}" (expected integer >= ${min})`);
  }
  return n;
}

export const config = {
  port: int('PORT', 4000),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  maxPlaylistSize: int('MAX_PLAYLIST_SIZE', 100),
  onVercel,
  downloadDir: path.resolve(
    serverRoot,
    process.env.DOWNLOAD_DIR ?? (onVercel ? path.join(os.tmpdir(), 'tubegrab') : './downloads'),
  ),
  ytdlpPath: process.env.YTDLP_PATH?.trim() || 'yt-dlp',
  ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
  fileTtlMs: int('FILE_TTL_MINUTES', 30) * 60_000,
  rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 10),
  trustProxy: onVercel || process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  /** Max simultaneous yt-dlp downloads per playlist batch. */
  batchConcurrency: 2,
} as const;
