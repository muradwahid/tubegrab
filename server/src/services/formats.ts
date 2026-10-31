/**
 * Format/quality logic: turning yt-dlp's raw format list into deduplicated
 * resolution options, and turning a chosen quality into yt-dlp arguments.
 */

export const VIDEO_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144] as const;
export type VideoHeight = (typeof VIDEO_HEIGHTS)[number];
export type VideoQuality = `${VideoHeight}p`;
export type AudioQuality = 'mp3' | 'm4a';
export type Quality = VideoQuality | AudioQuality;
export type OutputFormat = 'mp4' | 'webm';

export const PLAYLIST_QUALITIES: readonly Quality[] = ['1080p', '720p', '480p', '360p', 'mp3'];

/** Some encodes are a few px taller than nominal (e.g. 1920x1088). */
const TOLERANCE = 1.05;
const MP3_BYTES_PER_SEC = 245_000 / 8; // ~V0 VBR average

export interface RawFormat {
  format_id?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  tbr?: number | null;
  abr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  format_note?: string;
  protocol?: string;
}

export interface QualityOption {
  id: Quality;
  label: string;
  kind: 'video' | 'audio';
  height: number | null;
  fps: number | null;
  /** Estimated bytes per output container; absent when unknown. */
  sizes: Partial<Record<OutputFormat | 'audio', number>>;
}

export function isQuality(v: unknown): v is Quality {
  return (
    typeof v === 'string' &&
    (v === 'mp3' || v === 'm4a' || VIDEO_HEIGHTS.some((h) => `${h}p` === v))
  );
}

export function isOutputFormat(v: unknown): v is OutputFormat {
  return v === 'mp4' || v === 'webm';
}

export function qualityHeight(q: Quality): number | null {
  return q === 'mp3' || q === 'm4a' ? null : Number.parseInt(q, 10);
}

export function isAudioQuality(q: Quality): q is AudioQuality {
  return q === 'mp3' || q === 'm4a';
}

/**
 * Map real dimensions to a standard bucket. Uses the smaller dimension so that
 * vertical videos (Shorts, 1080x1920) are labelled 1080p like YouTube does.
 */
export function bucketFor(width?: number | null, height?: number | null): VideoHeight | null {
  const res = width && height ? Math.min(width, height) : height;
  if (!res) return null;
  const ascending = [...VIDEO_HEIGHTS].reverse();
  return ascending.find((h) => res <= h * TOLERANCE) ?? null;
}

export function qualityLabel(q: Quality): string {
  switch (q) {
    case 'mp3':
      return 'Audio only (MP3)';
    case 'm4a':
      return 'Audio only (M4A)';
    case '2160p':
      return '2160p (4K)';
    case '1440p':
      return '1440p (2K)';
    default:
      return q;
  }
}

function sizeOf(f: RawFormat, duration: number | null): number | null {
  if (f.filesize) return f.filesize;
  if (f.filesize_approx) return f.filesize_approx;
  if (f.tbr && duration) return Math.round(f.tbr * 125 * duration);
  return null;
}

const isHls = (f: RawFormat) => (f.protocol ?? '').startsWith('m3u8');
const hasVideo = (f: RawFormat) => !!f.vcodec && f.vcodec !== 'none';
const hasAudio = (f: RawFormat) => !!f.acodec && f.acodec !== 'none';
const isUsable = (f: RawFormat) =>
  f.ext !== 'mhtml' && !/storyboard/i.test(f.format_note ?? '') && !(f.format_id ?? '').includes('-drc');

function pickBestAudio(formats: RawFormat[], ext: string): RawFormat | undefined {
  const audio = formats.filter((f) => isUsable(f) && hasAudio(f) && !hasVideo(f));
  const preferred = audio.filter((f) => f.ext === ext);
  const pool = preferred.length ? preferred : audio;
  return pool.sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];
}

function codecRank(vcodec: string | undefined, container: OutputFormat): number {
  const c = vcodec ?? '';
  if (container === 'mp4') return /^avc1|^h264/.test(c) ? 2 : /^av01/.test(c) ? 1 : 0;
  return /^vp0?9/.test(c) ? 2 : /^av01/.test(c) ? 1 : 0;
}

/**
 * Build the deduplicated list of qualities that this video actually offers,
 * with an estimated download size per container.
 */
export function buildQualityOptions(formats: RawFormat[], duration: number | null): QualityOption[] {
  const video = formats.filter((f) => isUsable(f) && hasVideo(f));
  const byBucket = new Map<VideoHeight, RawFormat[]>();
  for (const f of video) {
    const bucket = bucketFor(f.width, f.height);
    if (!bucket) continue;
    const list = byBucket.get(bucket) ?? [];
    list.push(f);
    byBucket.set(bucket, list);
  }

  const options: QualityOption[] = [];
  for (const height of VIDEO_HEIGHTS) {
    const candidates = byBucket.get(height);
    if (!candidates?.length) continue;
    const sizes: QualityOption['sizes'] = {};
    for (const container of ['mp4', 'webm'] as const) {
      const sameExt = candidates.filter((f) => f.ext === container);
      const pool = (sameExt.length ? sameExt : candidates).slice().sort(
        (a, b) =>
          codecRank(b.vcodec, container) - codecRank(a.vcodec, container) ||
          Number(isHls(a)) - Number(isHls(b)) ||
          (b.fps ?? 0) - (a.fps ?? 0) ||
          (b.tbr ?? 0) - (a.tbr ?? 0),
      );
      const best = pool[0];
      if (!best) continue;
      let size = sizeOf(best, duration);
      if (size !== null && !hasAudio(best)) {
        const audio = pickBestAudio(formats, container === 'mp4' ? 'm4a' : 'webm');
        const audioSize = audio ? sizeOf(audio, duration) : null;
        size = audioSize !== null ? size + audioSize : size;
      }
      if (size !== null) sizes[container] = size;
    }
    const fps = Math.max(...candidates.map((f) => f.fps ?? 0)) || null;
    const id = `${height}p` as VideoQuality;
    options.push({ id, label: qualityLabel(id), kind: 'video', height, fps, sizes });
  }

  const hasAnyAudio = formats.some((f) => isUsable(f) && hasAudio(f));
  if (hasAnyAudio) {
    const m4a = pickBestAudio(formats, 'm4a');
    const m4aSize = m4a ? sizeOf(m4a, duration) : null;
    options.push({
      id: 'mp3',
      label: qualityLabel('mp3'),
      kind: 'audio',
      height: null,
      fps: null,
      sizes: duration ? { audio: Math.round(duration * MP3_BYTES_PER_SEC) } : {},
    });
    options.push({
      id: 'm4a',
      label: qualityLabel('m4a'),
      kind: 'audio',
      height: null,
      fps: null,
      sizes: m4aSize !== null ? { audio: m4aSize } : {},
    });
  }
  return options;
}

/**
 * yt-dlp format-selection arguments for a quality + container.
 *
 * Video: tries the requested container's native streams first
 * (e.g. `bv[height<=1080][ext=mp4]+ba[ext=m4a]`), then any codec at that
 * height, then a progressive stream, and finally the lowest available quality.
 * Because every filter is `<=`, a video without the requested height
 * automatically falls back to the next lower one.
 * Vertical videos are matched by width so a 1080x1920 Short counts as 1080p.
 */
export function buildFormatArgs(quality: Quality, container: OutputFormat): string[] {
  if (quality === 'mp3') {
    return ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'];
  }
  if (quality === 'm4a') {
    return ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a', '--audio-quality', '0'];
  }

  const limit = Math.floor((qualityHeight(quality) ?? 1080) * TOLERANCE);
  const portrait = `bv[aspect_ratio<1][width<=${limit}]`;
  const landscape = `bv[height<=${limit}]`;
  const progressive = `b[height<=${limit}]`;
  const [vExt, aExt] = container === 'mp4' ? ['mp4', 'm4a'] : ['webm', 'webm'];

  const selector = [
    `${portrait}[ext=${vExt}]+ba[ext=${aExt}]`,
    `${landscape}[ext=${vExt}]+ba[ext=${aExt}]`,
    `${portrait}+ba`,
    `${landscape}+ba`,
    progressive,
    'wv+ba',
    'w',
  ].join('/');

  // Sort: highest resolution first, then a codec that plays well in the container.
  const sort =
    container === 'mp4' ? 'res,fps,vcodec:h264,acodec:aac' : 'res,fps,vcodec:vp9,acodec:opus';

  return [
    '-f',
    selector,
    '-S',
    sort,
    '--merge-output-format',
    container === 'mp4' ? 'mp4' : 'webm/mkv',
  ];
}
