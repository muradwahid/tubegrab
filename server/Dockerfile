# syntax=docker/dockerfile:1
# TubeGrab API — Node 20 + yt-dlp + ffmpeg
# Build:  docker build -t tubegrab-server ./server
# Run:    docker run -p 4000:4000 -e CLIENT_ORIGIN=https://your-frontend.app tubegrab-server

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

ENV NODE_ENV=production \
    PORT=4000 \
    DOWNLOAD_DIR=/tmp/tubegrab \
    TRUST_PROXY=1

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
