/** Shared API types — mirror the server's response shapes. */

export type VideoQuality = '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | '240p' | '144p';
export type AudioQuality = 'mp3' | 'm4a';
export type Quality = VideoQuality | AudioQuality;
export type OutputFormat = 'mp4' | 'webm';
export type Mode = 'single' | 'playlist';

export interface QualityOption {
  id: Quality;
  label: string;
  kind: 'video' | 'audio';
  height: number | null;
  fps: number | null;
  sizes: Partial<Record<OutputFormat | 'audio', number>>;
}

export interface VideoInfo {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  channel: string;
  channelUrl: string | null;
  duration: number | null;
  viewCount: number | null;
  uploadDate: string | null;
  qualities: QualityOption[];
}

export type JobStatus =
  | 'queued'
  | 'starting'
  | 'downloading'
  | 'merging'
  | 'converting'
  | 'done'
  | 'error'
  | 'cancelled';

export interface JobSnapshot {
  jobId: string;
  status: JobStatus;
  percent: number;
  speed: number | null;
  eta: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  title: string | null;
  filename: string | null;
  quality: Quality;
  actualQuality: string | null;
  fallback: boolean;
  error: string | null;
  errorCode: string | null;
}

export interface PlaylistVideo {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string;
  channel: string | null;
  unavailable: boolean;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  channel: string | null;
  totalCount: number;
  truncated: boolean;
  maxSize: number;
  videos: PlaylistVideo[];
}

export interface BatchItemSnapshot extends Omit<JobSnapshot, 'jobId'> {
  jobId: string | null;
  videoId: string;
  index: number;
}

export interface BatchSnapshot {
  batchId: string;
  status: 'running' | 'done' | 'cancelled';
  title: string | null;
  quality: Quality;
  format: OutputFormat;
  total: number;
  completed: number;
  failed: number;
  active: number;
  items: BatchItemSnapshot[];
}

export interface HealthResponse {
  ok: boolean;
  ytdlp: string | null;
  maxPlaylistSize: number;
}

export interface HistoryItem {
  id: string;
  kind: 'video' | 'playlist';
  title: string;
  url: string;
  thumbnail: string | null;
  /** e.g. "1080p · MP4" or "12 videos · 720p" */
  detail: string;
  filename: string | null;
  createdAt: number;
}

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(['done', 'error', 'cancelled']);
