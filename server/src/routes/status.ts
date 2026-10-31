import { Router } from 'express';
import { config } from '../config.js';
import { getFfmpegVersion, getYtdlpVersion } from '../services/ytdlp.js';
import { clientStatus } from '../services/clients.js';

interface Status {
  ok: boolean;
  status: 'ok' | 'degraded';
  service: 'tubegrab-api';
  ytdlp: string | null;
  ffmpeg: string | null;
  /** Whether YTDLP_COOKIES / YTDLP_PROXY are configured (values are never exposed). */
  cookies: boolean;
  proxy: boolean;
  /** YouTube player client that last worked on this instance, and per-client results. */
  youtubeClient: { preferred: string | null; tried: Record<string, string> };
  maxPlaylistSize: number;
  /** Non-secret settings in effect, so you can confirm environment variables were applied. */
  settings: Record<string, string | number | boolean>;
  uptimeSeconds: number;
  node: string;
  time: string;
}

const startedAt = Date.now();
let ytdlp: string | null = null;
let ffmpeg: string | null = null;

/**
 * Detect the binaries (at boot and on status requests, cached ~30s).
 * Concurrent callers share one in-flight check, so a request that arrives
 * while the boot check is still running waits for it instead of seeing nulls.
 */
let lastCheck = 0;
let inFlight: Promise<{ ytdlp: string | null; ffmpeg: string | null }> | null = null;
export function refreshBinaries(force = false): Promise<{ ytdlp: string | null; ffmpeg: string | null }> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastCheck <= 30_000) return Promise.resolve({ ytdlp, ffmpeg });
  inFlight = Promise.all([getYtdlpVersion(), getFfmpegVersion()])
    .then(([y, f]) => {
      ytdlp = y;
      ffmpeg = f;
      lastCheck = Date.now();
      return { ytdlp, ffmpeg };
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function currentStatus(): Promise<Status> {
  const bins = await refreshBinaries();
  const healthy = !!bins.ytdlp && !!bins.ffmpeg;
  return {
    // `ok` means the API process is up; `status` says whether downloads can work.
    ok: true,
    status: healthy ? 'ok' : 'degraded',
    service: 'tubegrab-api',
    ytdlp: bins.ytdlp,
    ffmpeg: bins.ffmpeg,
    cookies: !!config.ytdlpCookies,
    proxy: !!config.ytdlpProxy,
    youtubeClient: clientStatus(),
    maxPlaylistSize: config.maxPlaylistSize,
    settings: {
      platform: config.onVercel ? 'vercel' : config.inContainer ? 'container' : 'local',
      port: config.port,
      trustProxy: config.trustProxy,
      rateLimitPerMinute: config.rateLimitPerMinute,
      maxPlaylistSize: config.maxPlaylistSize,
      fileTtlMinutes: Math.round(config.fileTtlMs / 60_000),
      sseMaxSeconds: config.sseMaxSeconds,
      downloadDir: config.downloadDir,
      clientOrigin: config.clientOrigins.join(', '),
      ytdlpCookies: config.ytdlpCookies ? 'set' : 'not set',
      ytdlpProxy: config.ytdlpProxy ? 'set' : 'not set',
    },
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    node: process.version,
    time: new Date().toISOString(),
  };
}

const esc = (v: unknown) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (s < 60) return `${s}s`;
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`, `${s % 60}s`].filter(Boolean).join(' ');
}

function renderHtml(s: Status): string {
  const row = (label: string, value: string | null, good: boolean) =>
    `<tr><td>${esc(label)}</td><td><span class="dot ${good ? 'ok' : 'bad'}"></span>${esc(value ?? 'not found')}</td></tr>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TubeGrab API · ${s.status === 'ok' ? 'Running' : 'Degraded'}</title>
<style>
  :root { color-scheme: dark light; --bg:#0b0b0f; --card:#16161c; --text:#f4f4f5; --muted:#a1a1aa; --line:#27272a; }
  @media (prefers-color-scheme: light) { :root { --bg:#fafafa; --card:#fff; --text:#18181b; --muted:#71717a; --line:#e4e4e7; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px; background:var(--bg); color:var(--text);
         font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .card { width:100%; max-width:520px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; }
  h1 { margin:0 0 4px; font-size:22px; } h1 b { color:#ef4444; }
  .badge { display:inline-block; margin:8px 0 20px; padding:4px 12px; border-radius:999px; font-weight:600; font-size:13px; }
  .badge.ok { background:rgb(16 185 129 / .15); color:#10b981; } .badge.bad { background:rgb(245 158 11 / .15); color:#f59e0b; }
  table { width:100%; border-collapse:collapse; } td { padding:8px 0; border-top:1px solid var(--line); }
  td:first-child { color:var(--muted); width:42%; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:middle; }
  .dot.ok { background:#10b981; } .dot.bad { background:#ef4444; } .dot.off { background:#71717a; }
  p { color:var(--muted); font-size:13px; margin:16px 0 0; } a { color:#ef4444; } code { font-size:12px; }
</style>
</head>
<body>
<main class="card">
  <h1>Tube<b>Grab</b> API</h1>
  <span class="badge ${s.status === 'ok' ? 'ok' : 'bad'}">${s.status === 'ok' ? '● Running — ready to download' : '● Running — missing dependencies'}</span>
  <table>
    ${row('yt-dlp', s.ytdlp, !!s.ytdlp)}
    ${row('ffmpeg', s.ffmpeg, !!s.ffmpeg)}
    <tr><td>YouTube cookies</td><td><span class="dot ${s.cookies ? 'ok' : 'off'}"></span>${s.cookies ? 'on' : 'off (set YTDLP_COOKIES if YouTube asks to confirm you’re not a bot)'}</td></tr>
    <tr><td>YouTube client</td><td>${esc(s.youtubeClient.preferred ?? 'not determined yet')}</td></tr>
    <tr><td>Proxy</td><td><span class="dot ${s.proxy ? 'ok' : 'off'}"></span>${s.proxy ? 'on' : 'off'}</td></tr>
    <tr><td>Node.js</td><td>${esc(s.node)}</td></tr>
    <tr><td>Uptime</td><td>${esc(formatUptime(s.uptimeSeconds))}</td></tr>
    <tr><td>Max playlist size</td><td>${esc(s.maxPlaylistSize)}</td></tr>
    <tr><td>Allowed frontend</td><td><code>${esc(config.clientOrigins.join(', '))}</code></td></tr>
  </table>
  <h2 style="font-size:14px;margin:20px 0 4px">Settings in use</h2>
  <table>
    ${Object.entries(s.settings)
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code></td></tr>`)
      .join('')}
  </table>
  ${s.status === 'ok' ? '' : `<p><b>Downloads won’t work on this host</b> until yt-dlp and ffmpeg are installed — see the README’s deployment section.</p>`}
  <p>Machine-readable: <a href="/api/health">/api/health</a>. This is the backend; open the TubeGrab web app to download videos.</p>
</main>
</body>
</html>`;
}

export const statusRouter = Router();

/**
 * Human-friendly status page in a browser, JSON for curl/monitors.
 * Served at "/" and at "/api" (on Vercel only /api/* reaches the server).
 */
statusRouter.get(['/', '/api', '/api/status'], async (_req, res) => {
  const s = await currentStatus();
  // JSON is listed first so `curl` (Accept: */*) gets JSON; browsers ask for text/html explicitly.
  res.format({
    json: () => res.json(s),
    html: () => res.type('html').send(renderHtml(s)),
    default: () => res.json(s),
  });
});

/** Health check for the frontend (demo-mode detection) and uptime monitors. */
statusRouter.get('/api/health', async (_req, res) => {
  res.json(await currentStatus());
});
