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
- **Channels**: paste a channel link (`youtube.com/@name`, `/channel/UC…`, `/c/…`, `/user/…`) to list its **Videos**, **Shorts** or **Live** uploads, newest first, 100 at a time with "Load older videos". Each video shows its **upload date** and views, and an "Uploaded from … to …" filter plus Newest/Oldest sorting narrow the list. Download the selection with the same queue, fallback and ZIP as playlists. Channel pages only say "3 weeks ago" / "1 month ago", so older dates are shown as YouTube shows them (hover for the possible date range), and the filter keeps every video whose range overlaps your dates. **Private videos are never listed**: YouTube shows them only to the channel owner.
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
| `SSE_MAX_SECONDS` | `270` | Progress streams end after this long and the browser reconnects (keeps requests under Vercel's 300s limit). `0` = never |
| `YTDLP_COOKIES` | (none) | Netscape `cookies.txt` contents (or base64 of it), for YouTube "not a bot" checks on cloud hosts |
| `YTDLP_PROXY` | (none) | Proxy for yt-dlp, e.g. `http://user:pass@host:port` |
| `YTDLP_CLIENT_FALLBACK` | built-in list | YouTube player clients tried in order when YouTube answers with a bot check (comma-separated; `off` disables) |
| `YTDLP_EXTRACTOR_ARGS` | (none) | Passed to yt-dlp `--extractor-args`, e.g. `youtube:player_client=tv_simply,mweb` |

**client/.env**

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | dev: `http://localhost:4000`, production build: same origin | Base URL of the API (no trailing slash). Leave unset on Vercel |

## API

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /` · `GET /api` · `GET /api/status` | | Status page in a browser (yt-dlp/ffmpeg found, uptime); JSON for curl |
| `GET /api/health` | | `{ ok, status: "ok" \| "degraded", ytdlp, ffmpeg, maxPlaylistSize, uptimeSeconds, … }` |
| `POST /api/info` | `{ url }` | Video metadata + `qualities[]` |
| `POST /api/download` | `{ url, resolution, format }` | `{ jobId }` |
| `GET /api/progress/:jobId` | | SSE `progress` events: `{ status, percent, speed, eta, filename, … }` |
| `GET /api/file/:jobId` | | The finished file (`Content-Disposition: attachment`) |
| `DELETE /api/download/:jobId` | | Cancels and kills yt-dlp |
| `POST /api/playlist` | `{ url }` | Playlist metadata + `videos[]` |
| `POST /api/channel` | `{ url, tab?: "videos" \| "shorts" \| "streams", page?: 1-based }` | Channel name, handle, avatar, subscribers + one page of `videos[]` (with `uploadDate`, `viewCount`) and `hasMore` |
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

### Option A: Vercel, full stack in one project (configured)

`vercel.json` deploys both parts as [Vercel Services](https://vercel.com/docs/services) on one domain:

| Service | Root | How it runs | Routes |
| --- | --- | --- | --- |
| `client` | `client/` | Vite static build | everything except `/api` |
| `server` | `server/` | **Container** built from `server/Dockerfile` (Node 20 + yt-dlp + ffmpeg) | `/api`, `/api/*` |

Because both share one domain, the frontend calls `/api/...` directly: no `VITE_API_URL` and no CORS setup.

**Deploy:**

1. Push the repo to GitHub.
2. On [vercel.com/new](https://vercel.com/new), import the repo. Leave **Root Directory** empty (the repo root, where `vercel.json` lives). Vercel reads `vercel.json` and picks the Services setup; if it asks for a framework, choose **Services**. Don't set build commands in the dashboard, because each service has its own in `vercel.json`.
3. Optional environment variables (Project → Settings → Environment Variables), all for the server:
   - `MAX_PLAYLIST_SIZE` (default `100`)
   - `YTDLP_COOKIES`: see "YouTube bot checks" below
   - `YTDLP_PROXY`
   - Leave `PORT` unset; the image listens on port 80, Vercel's container default.
   - You don't need to copy your local `.env` values into Vercel; the defaults are right for Vercel. A copied `TRUST_PROXY=0` or a `localhost` `VITE_API_URL` is ignored on the deployed site.
4. Deploy, then check **`https://<your-project>.vercel.app/api`**. Its **Settings in use** table shows the values the server actually applied. The status page should say **"Running — ready to download"** with yt-dlp and ffmpeg versions. If it does, the app at `https://<your-project>.vercel.app/` works end to end.

Every `git push` to the production branch redeploys automatically.

**Limits on Vercel (beta platform features, Hobby plan):**

- **5 minutes per request.** Progress streams renew themselves every 270s (`SSE_MAX_SECONDS`), so long downloads keep reporting progress. Very long or 4K videos can still fail if yt-dlp itself needs more than the instance stays alive, and saving a huge file over a slow connection can be cut off. Short and medium videos are fine. The Pro plan raises the limit to 800s.
- **State in memory.** Jobs live in the container's memory. Vercel reuses a running instance before starting a new one, so with normal personal traffic every request hits the same instance. Under heavy concurrent traffic Vercel may start a second instance, and a progress, file or ZIP request that lands there gets "Download not found or expired". For heavy public use, Option B is more robust.
- **Idle scale-down.** Instances shut down after about 5 minutes without traffic, and unfinished or undownloaded files go with them. Download your files when they finish.
- **YouTube bot checks.** The server first works around them by itself: when YouTube answers "confirm you're not a bot", it retries with other YouTube player clients (`tv_embedded`, `web_embedded`, then mobile/VR clients) and remembers the one that works. The `/api` page shows it under **YouTube client**. If every client is blocked, YouTube often answers cloud IPs (Vercel, Render, AWS…) with "Sign in to confirm you're not a bot", and the app then shows *"YouTube is blocking this server"*. Fix it with cookies from a YouTube account:
  1. Use a **throwaway** Google/YouTube account; heavy yt-dlp use can get an account flagged.
  2. Open a **private/incognito window** and sign in to YouTube with it.
  3. In that window, open `https://www.youtube.com/robots.txt` and make it the only open tab.
  4. Export the cookies in **Netscape format**, e.g. with the "Get cookies.txt LOCALLY" extension (allow it in incognito), and save `cookies.txt`.
  5. **Close the private window right away.** If you keep browsing, YouTube rotates the session and the exported cookies stop working.
  6. Base64-encode the file: `base64 -i cookies.txt | pbcopy` (macOS) or `base64 -w0 cookies.txt` (Linux).
  7. In Vercel → Project → Settings → Environment Variables, add `YTDLP_COOKIES` = the copied value (Production + Preview).
  8. **Redeploy** (Deployments → ⋯ → Redeploy); environment changes only apply to new deployments.
  9. Open `/api`: **YouTube cookies** should show a green "on".

  Cookies eventually expire. If the error comes back, repeat these steps. If cookies alone aren't enough, `YTDLP_PROXY` (a residential proxy) and `YTDLP_EXTRACTOR_ARGS` (e.g. `youtube:player_client=tv_simply,mweb`) are further options.
- `vercel dev` can run the whole project locally, but it needs Docker installed for the container service. Plain `npm run dev` is simpler.

### Option B: Vercel frontend + Docker backend (Render, Railway, VPS)

Most robust: a long-running server with no request limit and a single process that holds all job state.

**Backend on Render:** New → Web Service → connect the repo → *Root Directory* `server`, *Runtime* Docker. Add `CLIENT_ORIGIN=https://<your-frontend>.vercel.app`. Render injects `PORT`; `TRUST_PROXY=1` and `DOWNLOAD_DIR=/tmp/tubegrab` are baked into the image. Health check path: `/api/health`. **Railway** works the same way (Root Directory `server`, it detects the Dockerfile).

**Frontend:** replace `vercel.json` with a frontend-only config (or delete it and set *Root Directory* `client` in Vercel), then set `VITE_API_URL=https://<your-api>.onrender.com` in Vercel and redeploy.

**Any Docker host:**

```bash
docker build -t tubegrab-server ./server
docker run -p 4000:80 -e CLIENT_ORIGIN=http://localhost:5173 tubegrab-server   # API on http://localhost:4000
```

General notes:
- Job state lives in memory, so run a **single instance**. Downloads are lost on restart, and leftover folders are cleaned on boot.
- Rebuild or redeploy periodically to pick up new yt-dlp releases; the Docker build always installs the latest.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "yt-dlp isn't installed on the server" banner | Install yt-dlp (see above) or set `YTDLP_PATH`, then restart the server |
| "YouTube is temporarily blocking requests from this server" | Common on cloud/datacenter IPs (Vercel, Render). Set `YTDLP_COOKIES` (throwaway account) or `YTDLP_PROXY`, redeploy to update yt-dlp, or run the API from a residential connection |
| Vercel: "Download not found or expired" | A request landed on a different or new instance (traffic spike or idle scale-down). Start the download again; for heavy use see Deployment option B |
| Vercel: `/api` shows yt-dlp/ffmpeg "not found" | The server service didn't build from the Dockerfile. Check that `vercel.json` is at the repo root and the project's Root Directory is empty |
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
