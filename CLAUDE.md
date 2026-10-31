# CLAUDE.md

Guidance for working on TubeGrab (YouTube video/playlist downloader). User docs live in `readme.md`.

## Commands

```bash
npm install            # root; postinstall installs server/ and client/
npm run dev            # server (tsx watch, :4000) + client (Vite, :5173) via concurrently
npm run typecheck      # tsc for both packages — run after every change
npm run build          # server → server/dist, client → client/dist
```

Prereqs on PATH: `node` 20+, `yt-dlp`, `ffmpeg` (`brew install yt-dlp ffmpeg` on macOS).
Public test video: `https://www.youtube.com/watch?v=jNQXAC9IVRw` (19s, only 240p/144p, which is handy for fallback tests).
Small test playlist: `UU4QobU6STFB0P71PMvOGN5A` (1 video). Large one: `UUSMOQeBJ2RAnuFungnQOxLg` (Blender uploads, more than 100, so it tests truncation).
No test suite yet. Verify with curl against the API (examples in readme.md) and in the browser.

## Architecture

**Monorepo, two independent npm packages** (`client/`, `server/`) with a root `package.json` holding only scripts. Types are duplicated deliberately: `client/src/types.ts` mirrors the server's response shapes, so update both when changing an API shape.

### Server (`server/src`, Express 5, ESM, `NodeNext` — imports need `.js` extensions)
- `config.ts`: all env parsing (PORT, CLIENT_ORIGIN, MAX_PLAYLIST_SIZE, DOWNLOAD_DIR, FILE_TTL_MINUTES, RATE_LIMIT_PER_MINUTE, TRUST_PROXY, YTDLP_PATH, FFMPEG_PATH, SSE_MAX_SECONDS, YTDLP_COOKIES, YTDLP_PROXY, YTDLP_EXTRACTOR_ARGS). `/api` and `/api/health` report whether cookies/proxy are set (never their values).
- `services/ytdlp.ts`: `baseArgs()` (adds `--ignore-config`, `--js-runtimes node:<execPath>`), `spawnYtdlp` (detached process group; adds `--proxy` and a **per-process temp copy** of the cookies file, since yt-dlp rewrites it on exit), `killTree` (kills yt-dlp **and** its ffmpeg children), `runYtdlpJson` for `--dump-json` calls.
- `services/clients.ts`: YouTube **player-client fallback**. On a `BOT_CHECK` error (and after one, on unknown `DOWNLOAD_FAILED` errors), `withClientFallback` (info/playlist) and `Job.start` (downloads) retry with `--extractor-args youtube:player_client=<next>`. The first working client is remembered per instance and shown on `/api`. Order: `default, tv_embedded, web_embedded, android_vr, mweb, tv_simply, android`; `tv`, `web_safari`, `ios` and `web` were broken with yt-dlp 2026.10, so re-test the order when upgrading. Disabled when `YTDLP_EXTRACTOR_ARGS` is set.
- `services/formats.ts`: quality model. `bucketFor(w,h)` labels by the **smaller dimension** (Shorts 1080x1920 → 1080p) with a 5% tolerance. `buildQualityOptions` dedupes formats into resolution options with size estimates. `buildFormatArgs` builds the `-f` selector chain: portrait match → `bv[height<=H][ext=mp4]+ba[ext=m4a]` → any codec → progressive → worst. Every filter is `<=`, which is what implements "fall back to the next lower resolution". `-S res,fps,vcodec:h264` prefers H.264 for MP4 compatibility.
- `services/jobs.ts`: the core.
  - `Job`: one yt-dlp process. Progress comes from custom `--progress-template` / `--print` lines prefixed `TG_PROG|`, `TG_INFO|`, `TG_POST|`, `TG_DONE|` (pipe-delimited, `NA` = null), not the human progress output. Handles multi-part (video+audio) percent. Files are saved as `<jobDir>/media.<ext>`, and the user-facing name (`Title [720p].mp4`) is applied only in `Content-Disposition` / ZIP entry names. Emits throttled `update` (250ms) and `finished`.
  - `Batch`: playlist queue, `config.batchConcurrency` = 2, retry, cancel. Item jobs live in `<batchDir>/<jobId>/`.
  - Registry and lifecycle: in-memory maps (single instance only). `subscribe()` counts SSE listeners, and if none remain for 20s (`ORPHAN_GRACE_MS`) the job/batch is cancelled. This is the "kill on client disconnect" behaviour, and the grace period also absorbs React StrictMode double-mounts and EventSource reconnects. Cleanup sweeps every 60s: single jobs are removed TTL after completion, batches TTL after **all** items finish. On boot, UUID-named folders in DOWNLOAD_DIR are deleted (only UUID names, for safety).
- `routes/`: `status.ts` (`GET /`, `/api`, `/api/status`: HTML status page for browsers, JSON for curl; on Vercel only `/api*` reaches the server; `GET /api/health`: JSON incl. yt-dlp/ffmpeg versions, binaries re-checked at most every 30s), `info.ts`, `download.ts`, `playlist.ts`, `helpers.ts` (`parseQualityAndFormat`, `param` UUID check, `abortOnClose`).
- `utils/`: `validateUrl.ts` (host allow-list; **rebuilds canonical URLs from validated IDs**), `errors.ts` (`AppError` + ordered regex rules mapping yt-dlp stderr to friendly codes/messages), `sanitize.ts`, `sse.ts` (headers, 15s heartbeat, `retry: 3000`, and the stream **ends itself after `SSE_MAX_SECONDS`** (default 270) so it stays under Vercel's 300s request limit; EventSource reconnects and gets a fresh snapshot).

### Client (`client/src`, React 19, Tailwind v4 via `@tailwindcss/vite`)
- `api/client.ts`: the only place that knows endpoint paths. Network failures throw `BackendUnreachableError` and notify `onReachabilityChange`, which drives the demo-mode banner (`hooks/useBackendStatus.ts`).
- `hooks/useEventSource.ts`: SSE subscription. Return `true` from the handler to close the stream; **always close on terminal states**, otherwise EventSource reconnects forever. `PlaylistView` appends `?k=<streamKey>` to reopen the stream after a retry on a finished batch.
- `views/SingleVideoView.tsx`, `views/PlaylistView.tsx`: each owns its flow's state. Both stay mounted (hidden with `hidden`) so switching tabs doesn't lose progress. `App.tsx` owns mode, per-mode URLs and `fetchSignals` (a counter bump asks a view to fetch, used by the playlist banner and history).
- Styling: theme tokens and reusable `@utility` classes (`card`, `btn-primary`, `btn-secondary`, `btn-ghost`, `section-label`) live in `index.css`. Dark mode is class-based (`@custom-variant dark`), defaults to dark, and is persisted in `localStorage['tubegrab:theme']`; `index.html` applies it before paint. Accent `#ef4444` = `bg-accent`/`text-accent`. Use the existing `@utility` classes; Tailwind v4 can't `@apply` classes from `@layer components`.
- localStorage keys: `tubegrab:theme`, `tubegrab:history` (max 10).

## Deployment (Vercel)

`vercel.json` uses **Vercel Services** (beta): `client/` is a Vite service, and `server/` is a **container** service built from `server/Dockerfile` (routes `/api` and `/api/*`; the service receives the full original path). The image listens on **port 80** (Vercel's container default) and runs as root to bind it; Render and Railway override it with `$PORT`. The client defaults to same-origin API calls in production builds, so don't set `VITE_API_URL` on Vercel. Job state is in-memory per instance: it works because Vercel reuses warm instances, but it isn't guaranteed across instances. Don't add features that assume cross-request state survives on Vercel without an external store.

To test Vercel-style routing locally without Docker, build the client with `VITE_API_URL= npx vite build`, then serve `dist/` behind a proxy that sends `/api*` to the server.

## Conventions & rules

- **Never build shell strings.** Always `spawn(bin, argsArray)` and put the URL after `'--'`. Only canonical URLs from `validateUrl.ts` reach yt-dlp.
- New user-facing errors go through `AppError(status, code, message)`. Add new yt-dlp stderr patterns to `RULES` in `utils/errors.ts` (order matters; the first match wins).
- Rate limiter only on endpoints that start yt-dlp work (`/info`, `/download`, `/playlist`, `/playlist/download`, retry), not on SSE/file/ZIP.
- Keep the server strictly typed (`noUncheckedIndexedAccess` is on in both packages).
- Components are presentational. Data fetching and flow state live in `views/`.
- Don't add the YouTube logo or branding. Keep the footer disclaimer.
- Don't run two servers against the same `DOWNLOAD_DIR`: boot cleanup deletes the other's job folders.
