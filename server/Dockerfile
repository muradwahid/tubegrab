# syntax=docker/dockerfile:1
# TubeGrab API — Node 20 + yt-dlp + ffmpeg
#
# Used by:
#   - Vercel (container service, see /vercel.json) — Vercel sends traffic to port 80
#   - Render / Railway / any Docker host — they inject $PORT, which overrides 80
# Local: docker build -t tubegrab-server ./server && docker run -p 4000:80 tubegrab-server

# ---- build stage: compile TypeScript -------------------------------------
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime stage ---------------------------------------------------------
FROM node:20-slim

# python3 + yt-dlp (with its default extras, incl. the YouTube JS challenge
# solver) and ffmpeg for merging video/audio streams and MP3 conversion.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]" \
 && rm -rf /var/lib/apt/lists/* /root/.cache

# PORT 80 is Vercel's default container port. The process runs as root so it
# can bind port 80 inside the isolated container; hosts that inject their own
# $PORT (Render, Railway) work the same way.
ENV NODE_ENV=production \
    PORT=80 \
    DOWNLOAD_DIR=/tmp/tubegrab \
    TRUST_PROXY=1

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||80)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
