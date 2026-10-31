import type {
  BatchSnapshot,
  HealthResponse,
  JobSnapshot,
  OutputFormat,
  PlaylistInfo,
  Quality,
  VideoInfo,
} from '../types';

/**
 * API base URL. In dev it defaults to the local server; in a production build
 * it defaults to the same origin (e.g. Vercel serving /api/* from the server).
 * A localhost VITE_API_URL (copied from a local .env by mistake) is ignored on a
 * deployed site, because a visitor's browser can't reach the developer's machine.
 */
function resolveApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (import.meta.env.DEV) return fromEnv || 'http://localhost:4000';
  const isLocalUrl = !!fromEnv && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(fromEnv);
  const pageIsLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  if (isLocalUrl && !pageIsLocal) return '';
  return fromEnv ?? '';
}

export const API_URL = resolveApiUrl().replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the API server can't be reached at all (network error / CORS / down). */
export class BackendUnreachableError extends Error {
  constructor() {
    super('The TubeGrab server is not reachable.');
    this.name = 'BackendUnreachableError';
  }
}

type Listener = (reachable: boolean) => void;
const listeners = new Set<Listener>();
/** Subscribe to backend reachability changes detected by any request. */
export function onReachabilityChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = (reachable: boolean) => listeners.forEach((fn) => fn(reachable));

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 120_000, signal, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: combined,
      headers: { 'Content-Type': 'application/json', ...rest.headers },
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timeout.aborted) throw new ApiError('The request timed out. Please try again.', 504, 'TIMEOUT');
    notify(false);
    throw new BackendUnreachableError();
  }
  notify(true);
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { code?: string; message?: string } })
    | null;
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body?.error?.code ?? 'UNKNOWN',
    );
  }
  return body as T;
}

const post = <T>(path: string, data: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(data), signal });

export const api = {
  health: () => request<HealthResponse>('/api/health', { timeoutMs: 5000 }),

  info: (url: string, signal?: AbortSignal) => post<VideoInfo>('/api/info', { url }, signal),

  startDownload: (url: string, resolution: Quality, format: OutputFormat) =>
    post<{ jobId: string }>('/api/download', { url, resolution, format }),

  cancelDownload: (jobId: string) =>
    request<{ ok: boolean }>(`/api/download/${jobId}`, { method: 'DELETE' }),

  playlist: (url: string, signal?: AbortSignal) => post<PlaylistInfo>('/api/playlist', { url }, signal),

  startPlaylist: (
    videos: Array<{ id: string; title: string }>,
    resolution: Quality,
    format: OutputFormat,
    title: string,
  ) => post<{ batchId: string }>('/api/playlist/download', { videos, resolution, format, title }),

  cancelPlaylist: (batchId: string) =>
    request<{ ok: boolean }>(`/api/playlist/${batchId}`, { method: 'DELETE' }),

  retryPlaylistItem: (batchId: string, videoId: string) =>
    post<{ ok: boolean }>(`/api/playlist/${batchId}/retry/${videoId}`, {}),

  progressUrl: (jobId: string) => `${API_URL}/api/progress/${jobId}`,
  fileUrl: (jobId: string) => `${API_URL}/api/file/${jobId}`,
  batchProgressUrl: (batchId: string) => `${API_URL}/api/playlist/progress/${batchId}`,
  zipUrl: (batchId: string) => `${API_URL}/api/playlist/zip/${batchId}`,
};

export type { JobSnapshot, BatchSnapshot };

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof BackendUnreachableError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
