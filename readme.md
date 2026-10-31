# TubeGrab

A full-stack YouTube video & playlist downloader.

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 + lucide-react (`/client`)
- **Backend:** Node.js + Express 5 + TypeScript (`/server`)
- **Engine:** system [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [ffmpeg](https://ffmpeg.org/), spawned with argument arrays (never a shell)
- **Live progress:** Server-Sent Events · **Playlist ZIPs:** `archiver`

> **Only download content you own or have permission to download.** Downloading may violate YouTube's Terms of Service. TubeGrab is not affiliated with YouTube or Google.

## Features

- **Single video**: preview card (thumbnail, title, channel, duration, views), resolutions built from the formats the video actually has (2160p → 144p) with estimated sizes, plus *Audio only (MP3/M4A)*. Output as MP4 or WEBM. Live progress (%, speed, ETA), cancel, and an automatic browser download named like `My Video Title [1080p].mp4`.
- **Playlists**: lists up to 100 videos (configurable) with checkboxes, Select/Deselect all, and a "videos 5 to 20" range picker. One resolution applies to the whole playlist, and videos that don't have it fall back to the next lower one (shown with a `fallback: 720p` badge). Downloads queue with at most 2 at a time, show per-video status (Queued / Downloading % / Merging / Done / Failed with Retry), and finish with a ZIP or individual files.
- **Playlist detection**: pasting a `list=` URL into the Single Video tab offers to switch modes.
- **UX**: dark theme by default with a light/dark toggle, paste-from-clipboard and clear buttons, skeleton loaders, toasts, the last 10 downloads in history (localStorage), and responsive layout down to phone width.
- **Demo mode**: if the API is unreachable, the UI shows a banner explaining that the backend must be running or deployed, instead of breaking.
- **Hardening**: URL allow-list (youtube.com / youtu.be / music.youtube.com), canonical URLs rebuilt from validated IDs, filename sanitizing for Windows/macOS/Linux, 10 req/min rate limit, clear error messages (private, age-restricted, region-blocked, unavailable, invalid URL, members-only, live), yt-dlp killed on cancel/disconnect, and files auto-deleted 30 minutes after completion.

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 20+ | `node -v` |
| yt-dlp | recent (YouTube changes often, so keep it updated) | `yt-dlp --version` |
| ffmpeg | any recent | `ffmpeg -version` |

### macOS

```bash
brew install node yt-dlp ffmpeg
# update later with: brew upgrade yt-dlp
```

### Windows

```powershell
winget install OpenJS.NodeJS.LTS yt-dlp.yt-dlp Gyan.FFmpeg
# or: scoop install nodejs-lts yt-dlp ffmpeg
```

Restart the terminal afterwards so `yt-dlp` and `ffmpeg` are on your `PATH`.

### Linux (Debian/Ubuntu)

```bash
sudo apt install ffmpeg pipx
pipx install "yt-dlp[default]"        # or: python3 -m pip install -U "yt-dlp[default]"
```

**Standalone binary (any OS, no Python):** download `yt-dlp` / `yt-dlp.exe` / `yt-dlp_macos` from the [latest release](https://github.com/yt-dlp/yt-dlp/releases/latest), make it executable (`chmod a+rx`), and put it on your `PATH`, or point `YTDLP_PATH` at it. Update with `yt-dlp -U`.

> YouTube requires a JavaScript runtime to solve player challenges. TubeGrab passes `--js-runtimes node:<path to the Node running the server>` to yt-dlp, so no extra install (like Deno) is needed.

## Setup

```bash
git clone <this repo> tubegrab && cd tubegrab
npm install                      # installs root + server + client (postinstall)
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run dev                      # API on :4000, web app on :5173
```

Open <http://localhost:5173>.

### Scripts (root)

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts server (`tsx watch`) and client (Vite) together via `concurrently` |
| `npm run build` | Compiles the server to `server/dist` and builds the client to `client/dist` |
| `npm run typecheck` | Type-checks both packages |
| `npm start` | Runs the compiled server (`node server/dist/index.js`) |

### Environment variables

**server/.env**

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s), comma-separated |
| `MAX_PLAYLIST_SIZE` | `100` | Max videos listed/downloaded per playlist |
| `DOWNLOAD_DIR` | `./downloads` | Folder for per-job temp folders (relative to `/server` or absolute) |
| `FILE_TTL_MINUTES` | `30` | Finished files are deleted after this many minutes |
| `RATE_LIMIT_PER_MINUTE` | `10` | Per-IP limit on endpoints that start yt-dlp work |
| `TRUST_PROXY` | `0` | Set to `1` behind a reverse proxy (Render, Railway, nginx) so rate limiting sees real IPs |
| `YTDLP_PATH` / `FFMPEG_PATH` | from `PATH` | Optional explicit binary paths |

**client/.env**

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000` | Base URL of the API (no trailing slash) |

## API

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /` | | Status page in a browser (yt-dlp/ffmpeg found, uptime); JSON for curl |
| `GET /api/health` | | `{ ok, status: "ok" \| "degraded", ytdlp, ffmpeg, maxPlaylistSize, uptimeSeconds, … }` |
| `POST /api/info` | `{ url }` | Video metadata + `qualities[]` |
| `POST /api/download` | `{ url, resolution, format }` | `{ jobId }` |
| `GET /api/progress/:jobId` | | SSE `progress` events: `{ status, percent, speed, eta, filename, … }` |
| `GET /api/file/:jobId` | | The finished file (`Content-Disposition: attachment`) |
| `DELETE /api/download/:jobId` | | Cancels and kills yt-dlp |
| `POST /api/playlist` | `{ url }` | Playlist metadata + `videos[]` |
| `POST /api/playlist/download` | `{ videos: [id \| {id,title}], resolution, format, title? }` | `{ batchId }` |
| `GET /api/playlist/progress/:batchId` | | SSE with overall + per-video statuses |
| `POST /api/playlist/:batchId/retry/:videoId` | | Re-queues a failed/cancelled video |
| `DELETE /api/playlist/:batchId` | | Cancels the whole batch |
| `GET /api/playlist/zip/:batchId` | | Streams a ZIP of completed files |

`resolution` is one of `2160p 1440p 1080p 720p 480p 360p 240p 144p mp3 m4a` (playlists: `1080p 720p 480p 360p mp3`). `format` is `mp4` or `webm`.

Try it with curl:

```bash
curl -s -X POST localhost:4000/api/info -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw"}'
JOB=$(curl -s -X POST localhost:4000/api/download -H 'content-type: application/json' \
  -d '{"url":"https://youtu.be/jNQXAC9IVRw","resolution":"720p","format":"mp4"}' | jq -r .jobId)
curl -N localhost:4000/api/progress/$JOB
curl -OJ localhost:4000/api/file/$JOB
```

## Deployment

The frontend is static. The backend needs a host that can run yt-dlp and ffmpeg and allows long-lived HTTP connections (SSE), so **don't** deploy the API to serverless functions.

### Backend → Render or Railway (Docker)

`server/Dockerfile` builds from `node:20-slim` and installs python3, `yt-dlp[default]` and ffmpeg.

**Render:** New → Web Service → connect the repo → *Root Directory* `server`, *Runtime* Docker. Set the environment variables:

```
CLIENT_ORIGIN=https://your-frontend.netlify.app
MAX_PLAYLIST_SIZE=100
```

`PORT` is provided by Render, and `TRUST_PROXY=1` and `DOWNLOAD_DIR=/tmp/tubegrab` are baked into the image. Health check path: `/api/health`.

**Check that it's working:** open the server URL (for example `https://your-api.onrender.com/`) in a browser. It shows a status page with green dots when yt-dlp and ffmpeg are found ("Running — ready to download"). `status: "degraded"` means the API is up but a binary is missing.

**Railway:** New Project → Deploy from repo → set the service's *Root Directory* to `server` (it detects the Dockerfile), then add the same variables and generate a public domain.

**Any Docker host:**

```bash
docker build -t tubegrab-server ./server
docker run -p 4000:4000 -e CLIENT_ORIGIN=http://localhost:5173 tubegrab-server
```

Notes:
- Job state lives in memory, so run a **single instance**. Downloads are lost on restart, and leftover folders are cleaned on boot.
- Disk: files are kept for `FILE_TTL_MINUTES`, so size the instance's disk for your expected concurrent downloads.
- Rebuild the image periodically to pick up new yt-dlp releases.

### Frontend → Netlify or Vercel

- **Netlify:** Base directory `client`, build command `npm run build`, publish directory `client/dist`. Environment: `VITE_API_URL=https://your-api.onrender.com`.
- **Vercel:** Import the repo, set *Root Directory* to `client` (Vite preset auto-detected), and add `VITE_API_URL`.

Then set the backend's `CLIENT_ORIGIN` to the deployed frontend URL. If the API is down or `VITE_API_URL` is wrong, the app shows the demo-mode banner.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "yt-dlp isn't installed on the server" banner | Install yt-dlp (see above) or set `YTDLP_PATH`, then restart the server |
| "YouTube is temporarily blocking requests from this server" | Common on cloud/datacenter IPs. Wait, update yt-dlp, or run the API from a residential connection |
| Downloads suddenly fail for every video | Update yt-dlp: `brew upgrade yt-dlp`, `yt-dlp -U`, or `pip install -U yt-dlp` |
| Demo-mode banner locally | Make sure `npm run dev` shows the server listening on `:4000` and `client/.env` points at it |
| CORS errors in the console | `CLIENT_ORIGIN` must exactly match the frontend origin (scheme + host + port) |

## Project structure

```
├── package.json          # root scripts (concurrently)
├── client/               # React app
│   └── src/
│       ├── api/client.ts         # fetch wrapper, endpoints, reachability events
│       ├── hooks/                # useTheme, useToast, useHistory, useEventSource, useBackendStatus
│       ├── components/           # UrlInput, ModeTabs, VideoPreviewCard, ResolutionSelector, FormatSelector,
│       │                         # ProgressBar, PlaylistList, DownloadQueue, HistoryPanel, ThemeToggle, …
│       ├── views/                # SingleVideoView, PlaylistView
│       └── App.tsx
└── server/               # Express API
    ├── Dockerfile
    └── src/
        ├── index.ts              # app, CORS, rate limit, error handler, shutdown
        ├── config.ts             # env parsing
        ├── routes/               # info, download, playlist
        ├── services/             # ytdlp (spawn/kill), formats (quality logic), jobs (Job, Batch, cleanup)
        └── utils/                # validateUrl, sanitize, errors, sse
```

## License

MIT. Use responsibly.
