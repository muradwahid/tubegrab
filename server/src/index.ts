import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { AppError } from './utils/errors.js';
import { infoRouter } from './routes/info.js';
import { downloadRouter } from './routes/download.js';
import { playlistRouter } from './routes/playlist.js';
import { cancelAll, startCleanup } from './services/jobs.js';
import { refreshBinaries, statusRouter } from './routes/status.js';

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.clientOrigins.includes('*') ? true : config.clientOrigins,
    methods: ['GET', 'POST', 'DELETE'],
    exposedHeaders: ['Content-Disposition'],
  }),
);
app.use(express.json({ limit: '200kb' }));

/**
 * Rate limit applies to the endpoints that start yt-dlp work (info lookups and
 * new downloads). Progress streams and file downloads are not limited, so a
 * playlist's individual links still work.
 */
const limiter = rateLimit({
  windowMs: 60_000,
  limit: config.rateLimitPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute and try again.' },
    });
  },
});

app.use(statusRouter);

app.use('/api/info', limiter);
app.use('/api', infoRouter);
app.use('/api', downloadRouter(limiter));
app.use('/api', playlistRouter(limiter));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Malformed JSON body.' } });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } });
};
app.use(errorHandler);

async function main() {
  // Listen first so the platform sees a healthy port quickly; checks follow.
  const server = app.listen(config.port, () => {
    console.log(`[tubegrab] API listening on http://localhost:${config.port}`);
    console.log(`[tubegrab] CORS origins: ${config.clientOrigins.join(', ')}`);
  });

  try {
    await startCleanup();
  } catch (err) {
    // Never crash because the download folder isn't writable; downloads will report the error.
    console.error(`[tubegrab] ⚠ cannot prepare download folder ${config.downloadDir}:`, err);
  }

  const { ytdlp, ffmpeg } = await refreshBinaries(true);
  console.log(`[tubegrab] yt-dlp ${ytdlp ?? 'MISSING'} · ffmpeg ${ffmpeg ?? 'MISSING'} · downloads → ${config.downloadDir}`);
  if (!ytdlp) console.warn(`[tubegrab] ⚠ yt-dlp not found ("${config.ytdlpPath}"). Install it — see README.md.`);
  if (!ffmpeg) console.warn(`[tubegrab] ⚠ ffmpeg not found ("${config.ffmpegPath}"). Merging/MP3 will fail — see README.md.`);

  const shutdown = () => {
    cancelAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();

// Default export for platforms that import the app (e.g. Vercel's Express runtime).
export default app;
