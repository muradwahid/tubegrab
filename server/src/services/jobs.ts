import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { config } from '../config.js';
import { AppError, mapYtdlpError, type ErrorCode } from '../utils/errors.js';
import { sanitizeFilename } from '../utils/sanitize.js';
import {
  bucketFor,
  buildFormatArgs,
  isAudioQuality,
  qualityHeight,
  type OutputFormat,
  type Quality,
} from './formats.js';
import { baseArgs, killTree, onLines, spawnError, spawnYtdlp } from './ytdlp.js';
import { clientArgs, clientOrder, reportClient, shouldTryNextClient } from './clients.js';

export type JobStatus =
  | 'queued'
  | 'starting'
  | 'downloading'
  | 'merging'
  | 'converting'
  | 'done'
  | 'error'
  | 'cancelled';

export const TERMINAL: ReadonlySet<JobStatus> = new Set(['done', 'error', 'cancelled']);

export interface JobSnapshot {
  jobId: string;
  status: JobStatus;
  /** 0–100 */
  percent: number;
  /** bytes/second */
  speed: number | null;
  /** seconds */
  eta: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  title: string | null;
  /** Final, sanitized download filename (set when done). */
  filename: string | null;
  quality: Quality;
  /** Actual quality delivered, e.g. "720p" (set when done). */
  actualQuality: string | null;
  /** True when the requested resolution wasn't available and a lower one was used. */
  fallback: boolean;
  error: string | null;
  errorCode: ErrorCode | null;
}

const EMIT_INTERVAL_MS = 250;
const PREFIX = { info: 'TG_INFO|', prog: 'TG_PROG|', post: 'TG_POST|', done: 'TG_DONE|' };

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === 'NA' || v === 'None' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A single yt-dlp download. Emits "update" (throttled) with a JobSnapshot and
 * "finished" once it reaches a terminal state.
 */
export class Job extends EventEmitter {
  readonly id = randomUUID();
  readonly dir: string;
  filePath: string | null = null;
  completedAt: number | null = null;

  private child: ChildProcess | null = null;
  private state: JobSnapshot;
  private lastEmit = 0;
  private emitTimer: NodeJS.Timeout | null = null;
  private stderrTail: string[] = [];
  private cancelled = false;

  // Progress bookkeeping across multiple streams (video + audio parts).
  private partCount = 1;
  private mergedEstimate: number | null = null;
  private parts = new Map<string, { downloaded: number; total: number | null }>();

  constructor(
    readonly url: string,
    readonly quality: Quality,
    readonly format: OutputFormat,
    parentDir: string,
  ) {
    super();
    this.dir = path.join(parentDir, this.id);
    this.state = {
      jobId: this.id,
      status: 'queued',
      percent: 0,
      speed: null,
      eta: null,
      downloadedBytes: 0,
      totalBytes: null,
      title: null,
      filename: null,
      quality,
      actualQuality: null,
      fallback: false,
      error: null,
      errorCode: null,
    };
  }

  get snapshot(): JobSnapshot {
    return { ...this.state };
  }

  get isTerminal(): boolean {
    return TERMINAL.has(this.state.status);
  }

  /** Runs the download. Resolves (never rejects) when the job is terminal. */
  async start(): Promise<void> {
    if (this.state.status !== 'queued') return;
    this.patch({ status: 'starting' }, true);
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch (err) {
      this.fail(new AppError(500, 'INTERNAL', `Could not create download folder: ${(err as Error).message}`));
      return;
    }
    if (this.cancelled) return;

    const order = clientOrder();
    let botCheckErr: AppError | null = null;
    for (const [i, client] of order.entries()) {
      const result = await this.runAttempt(clientArgs(client));
      if (this.cancelled || this.isTerminal) return;
      if ('spawnError' in result) {
        this.fail(result.spawnError);
        return;
      }
      if (result.code === 0) {
        reportClient(client, true);
        await this.onSuccess();
        return;
      }
      const err = mapYtdlpError(result.stderr);
      // YouTube bot check: retry the whole download with the next player client.
      if (shouldTryNextClient(err, botCheckErr !== null)) {
        reportClient(client, false);
        botCheckErr ??= err;
        if (i < order.length - 1) {
          console.warn(`[job ${this.id}] client "${client}" failed (${err.code}), retrying with "${order[i + 1]}"`);
          this.resetForRetry();
          continue;
        }
      }
      console.warn(`[job ${this.id}] yt-dlp exited with code ${result.code}\n${result.stderr.slice(-1500)}`);
      this.fail(botCheckErr ?? err);
      return;
    }
  }

  /** One yt-dlp run. Resolves with its exit code and stderr tail. */
  private runAttempt(
    clientExtraArgs: string[],
  ): Promise<{ code: number | null; stderr: string } | { spawnError: AppError }> {
    const args = [
      ...baseArgs(),
      ...clientExtraArgs,
      '--no-playlist',
      '--newline',
      '--progress',
      '--no-simulate',
      '--no-mtime',
      ...buildFormatArgs(this.quality, this.format),
      '--print',
      `before_dl:${PREFIX.info}%(format_id)s|%(filesize,filesize_approx)s|%(title)s`,
      '--print',
      `after_move:${PREFIX.done}%(width)s|%(height)s|%(ext)s|%(filepath)s`,
      '--progress-template',
      `download:${PREFIX.prog}%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(info.format_id)s`,
      '--progress-template',
      `postprocess:${PREFIX.post}%(progress.status)s|%(progress.postprocessor)s`,
      '-o',
      path.join(this.dir, 'media.%(ext)s'),
      '--',
      this.url,
    ];

    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawnYtdlp(args);
      } catch (err) {
        resolve({ spawnError: spawnError(err as NodeJS.ErrnoException) });
        return;
      }
      this.child = child;
      onLines(child, (line, stream) => this.handleLine(line, stream));
      child.on('error', (err) => resolve({ spawnError: spawnError(err) }));
      child.on('close', (code) => {
        this.child = null;
        resolve({ code, stderr: this.stderrTail.join('\n') });
      });
    });
  }

  /** Clear per-attempt state before retrying with another client. */
  private resetForRetry() {
    this.stderrTail = [];
    this.parts.clear();
    this.partCount = 1;
    this.mergedEstimate = null;
    this.filePath = null;
    this.patch({ status: 'starting', percent: 0, downloadedBytes: 0, totalBytes: null, speed: null, eta: null }, true);
  }

  cancel(): void {
    if (this.isTerminal) return;
    this.cancelled = true;
    if (this.child) killTree(this.child);
    this.finish({ status: 'cancelled', speed: null, eta: null });
    void this.removeFiles();
  }

  async removeFiles(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
  }

  private handleLine(line: string, stream: 'stdout' | 'stderr') {
    if (line.startsWith(PREFIX.prog)) return this.onProgress(line.slice(PREFIX.prog.length).split('|'));
    if (line.startsWith(PREFIX.info)) {
      const [formatId = '', size, ...titleParts] = line.slice(PREFIX.info.length).split('|');
      this.partCount = Math.max(1, formatId.split('+').length);
      this.mergedEstimate = num(size);
      this.patch({ title: titleParts.join('|') || null, status: 'downloading', totalBytes: this.mergedEstimate }, true);
      return;
    }
    if (line.startsWith(PREFIX.post)) {
      const [status, pp] = line.slice(PREFIX.post.length).split('|');
      if (status !== 'started') return;
      if (pp === 'Merger') this.patch({ status: 'merging', percent: 100, speed: null, eta: null }, true);
      else if (pp === 'FFmpegExtractAudio')
        this.patch({ status: 'converting', percent: 100, speed: null, eta: null }, true);
      return;
    }
    if (line.startsWith(PREFIX.done)) {
      const [w, h, ext, ...fp] = line.slice(PREFIX.done.length).split('|');
      this.filePath = fp.join('|');
      this.applyActualQuality(num(w), num(h), ext ?? 'mp4');
      return;
    }
    if (stream === 'stderr') {
      this.stderrTail.push(line);
      if (this.stderrTail.length > 40) this.stderrTail.shift();
    }
  }

  private onProgress([status, dl, total, totalEst, speed, eta, partId = 'single']: string[]) {
    const part = this.parts.get(partId) ?? { downloaded: 0, total: null };
    part.downloaded = num(dl) ?? part.downloaded;
    part.total = num(total) ?? num(totalEst) ?? part.total;
    if (status === 'finished' && part.total === null) part.total = part.downloaded;
    this.parts.set(partId, part);

    const all = [...this.parts.values()];
    const downloaded = all.reduce((s, p) => s + p.downloaded, 0);
    const knownTotal = all.reduce((s, p) => s + (p.total ?? 0), 0);
    const allStarted = this.parts.size >= this.partCount;

    let totalBytes: number | null = null;
    if (allStarted && knownTotal > 0) totalBytes = knownTotal;
    else if (this.mergedEstimate && this.mergedEstimate > knownTotal) totalBytes = this.mergedEstimate;

    let percent: number;
    if (totalBytes) {
      percent = (downloaded / totalBytes) * 100;
    } else {
      // Unknown sizes: average per-part fractions.
      const fractions = all.map((p) => (p.total ? p.downloaded / p.total : 0));
      percent = (fractions.reduce((a, b) => a + b, 0) / this.partCount) * 100;
    }
    percent = Math.min(99.5, Math.max(this.state.percent, percent));

    this.patch({
      status: 'downloading',
      percent: Math.round(percent * 10) / 10,
      downloadedBytes: downloaded,
      totalBytes,
      speed: status === 'finished' ? null : num(speed),
      eta: status === 'finished' ? null : num(eta),
    });
  }

  private applyActualQuality(width: number | null, height: number | null, ext: string) {
    const title = sanitizeFilename(this.state.title ?? 'video');
    if (isAudioQuality(this.quality)) {
      this.patch({ actualQuality: this.quality, filename: `${title}.${ext}` });
      return;
    }
    const bucket = bucketFor(width, height);
    const actual = bucket ? `${bucket}p` : height ? `${height}p` : null;
    const requested = qualityHeight(this.quality) ?? 0;
    this.patch({
      actualQuality: actual,
      fallback: bucket !== null && bucket < requested,
      filename: actual ? `${title} [${actual}].${ext}` : `${title}.${ext}`,
    });
  }

  private async onSuccess() {
    if (!this.filePath) this.filePath = await this.findOutputFile();
    if (this.filePath) {
      try {
        const stat = await fs.stat(this.filePath);
        if (!this.state.filename) {
          const ext = path.extname(this.filePath).slice(1) || 'mp4';
          this.applyActualQuality(null, null, ext);
        }
        this.finish({
          status: 'done',
          percent: 100,
          speed: null,
          eta: null,
          downloadedBytes: stat.size,
          totalBytes: stat.size,
        });
        return;
      } catch {
        /* fall through to error */
      }
    }
    this.fail(new AppError(500, 'DOWNLOAD_FAILED', 'yt-dlp finished but no output file was produced.'));
  }

  private async findOutputFile(): Promise<string | null> {
    try {
      const files = await fs.readdir(this.dir);
      const media = files.find((f) => f.startsWith('media.') && !/\.(part|ytdl|temp)$/.test(f));
      return media ? path.join(this.dir, media) : null;
    } catch {
      return null;
    }
  }

  private fail(err: AppError) {
    this.finish({ status: 'error', error: err.message, errorCode: err.code, speed: null, eta: null });
    void this.removeFiles();
  }

  private finish(patch: Partial<JobSnapshot>) {
    if (this.isTerminal) return;
    this.completedAt = Date.now();
    this.patch(patch, true);
    this.emit('finished', this.snapshot);
  }

  private patch(patch: Partial<JobSnapshot>, force = false) {
    Object.assign(this.state, patch);
    const now = Date.now();
    if (force || now - this.lastEmit >= EMIT_INTERVAL_MS) {
      if (this.emitTimer) clearTimeout(this.emitTimer);
      this.emitTimer = null;
      this.lastEmit = now;
      this.emit('update', this.snapshot);
    } else if (!this.emitTimer) {
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null;
        this.lastEmit = Date.now();
        this.emit('update', this.snapshot);
      }, EMIT_INTERVAL_MS - (now - this.lastEmit));
    }
  }
}

// ---------------------------------------------------------------------------
// Playlist batches
// ---------------------------------------------------------------------------

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

interface BatchItem {
  videoId: string;
  index: number;
  title: string | null;
  job: Job | null;
  /** Status for items that have no job yet (queued) or were cancelled before starting. */
  pendingStatus: 'queued' | 'cancelled';
}

export class Batch extends EventEmitter {
  readonly id = randomUUID();
  readonly dir: string;
  readonly items: BatchItem[];
  finishedAt: number | null = null;
  private cancelled = false;
  private emitTimer: NodeJS.Timeout | null = null;

  constructor(
    videos: Array<{ id: string; title?: string | null }>,
    readonly quality: Quality,
    readonly format: OutputFormat,
    readonly title: string | null,
    private readonly registerJob: (job: Job) => void,
  ) {
    super();
    this.dir = path.join(config.downloadDir, this.id);
    this.items = videos.map((v, index) => ({
      videoId: v.id,
      index,
      title: v.title ?? null,
      job: null,
      pendingStatus: 'queued',
    }));
  }

  get isFinished(): boolean {
    return this.items.every((i) => (i.job ? i.job.isTerminal : i.pendingStatus === 'cancelled'));
  }

  get snapshot(): BatchSnapshot {
    const items = this.items.map((item): BatchItemSnapshot => {
      const base: BatchItemSnapshot = item.job
        ? { ...item.job.snapshot, videoId: item.videoId, index: item.index }
        : {
            jobId: null,
            videoId: item.videoId,
            index: item.index,
            status: item.pendingStatus,
            percent: 0,
            speed: null,
            eta: null,
            downloadedBytes: 0,
            totalBytes: null,
            title: null,
            filename: null,
            quality: this.quality,
            actualQuality: null,
            fallback: false,
            error: null,
            errorCode: null,
          };
      base.title = base.title ?? item.title;
      return base;
    });
    return {
      batchId: this.id,
      status: this.cancelled ? 'cancelled' : this.isFinished ? 'done' : 'running',
      title: this.title,
      quality: this.quality,
      format: this.format,
      total: items.length,
      completed: items.filter((i) => i.status === 'done').length,
      failed: items.filter((i) => i.status === 'error').length,
      active: items.filter((i) => !TERMINAL.has(i.status) && i.status !== 'queued').length,
      items,
    };
  }

  start() {
    this.pump();
  }

  retry(videoId: string): boolean {
    const item = this.items.find((i) => i.videoId === videoId);
    if (!item?.job || !['error', 'cancelled'].includes(item.job.snapshot.status)) {
      if (item && !item.job && item.pendingStatus === 'cancelled') {
        item.pendingStatus = 'queued';
      } else {
        return false;
      }
    } else {
      item.job.removeAllListeners();
      item.job = null;
      item.pendingStatus = 'queued';
    }
    this.cancelled = false;
    this.finishedAt = null;
    this.pump();
    this.scheduleEmit(true);
    return true;
  }

  cancel() {
    this.cancelled = true;
    for (const item of this.items) {
      if (item.job) item.job.cancel();
      else item.pendingStatus = 'cancelled';
    }
    this.markFinishedIfDone();
    this.scheduleEmit(true);
  }

  async removeFiles(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
  }

  private pump() {
    if (this.cancelled) return;
    const running = this.items.filter((i) => i.job && !i.job.isTerminal).length;
    let slots = config.batchConcurrency - running;
    for (const item of this.items) {
      if (slots <= 0) break;
      if (item.job || item.pendingStatus !== 'queued') continue;
      const job = new Job(
        `https://www.youtube.com/watch?v=${item.videoId}`,
        this.quality,
        this.format,
        this.dir,
      );
      item.job = job;
      this.registerJob(job);
      job.on('update', () => this.scheduleEmit());
      job.on('finished', () => {
        this.scheduleEmit(true);
        this.pump();
        this.markFinishedIfDone();
      });
      void job.start();
      slots--;
    }
  }

  private markFinishedIfDone() {
    if (this.isFinished && this.finishedAt === null) {
      this.finishedAt = Date.now();
      this.scheduleEmit(true);
    }
  }

  private scheduleEmit(force = false) {
    if (force) {
      if (this.emitTimer) clearTimeout(this.emitTimer);
      this.emitTimer = null;
      this.emit('update', this.snapshot);
      return;
    }
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit('update', this.snapshot);
    }, 300);
  }
}

// ---------------------------------------------------------------------------
// Registry, disconnect-cancel and cleanup
// ---------------------------------------------------------------------------

const jobs = new Map<string, Job>();
const batches = new Map<string, Batch>();
/** Jobs belonging to a batch are owned (and cleaned up) by that batch. */
const batchJobs = new Set<string>();

/** How long an active download may run with nobody listening before it's cancelled. */
const ORPHAN_GRACE_MS = 20_000;
const subscribers = new Map<string, number>();
const orphanTimers = new Map<string, NodeJS.Timeout>();

function armOrphanTimer(id: string, onOrphan: () => void) {
  clearTimeout(orphanTimers.get(id));
  orphanTimers.set(
    id,
    setTimeout(() => {
      orphanTimers.delete(id);
      if ((subscribers.get(id) ?? 0) === 0) onOrphan();
    }, ORPHAN_GRACE_MS),
  );
}

/**
 * Track SSE listeners. When the last listener disconnects (tab closed,
 * navigation) and doesn't reconnect within the grace period, the download is
 * cancelled and the yt-dlp process killed.
 */
export function subscribe(id: string, onOrphan: () => void): () => void {
  subscribers.set(id, (subscribers.get(id) ?? 0) + 1);
  clearTimeout(orphanTimers.get(id));
  orphanTimers.delete(id);
  return () => {
    const n = (subscribers.get(id) ?? 1) - 1;
    subscribers.set(id, n);
    if (n <= 0) armOrphanTimer(id, onOrphan);
  };
}

export function createJob(url: string, quality: Quality, format: OutputFormat): Job {
  const job = new Job(url, quality, format, config.downloadDir);
  jobs.set(job.id, job);
  // Cancel if the client never opens the progress stream.
  armOrphanTimer(job.id, () => job.cancel());
  void job.start();
  return job;
}

export function createBatch(
  videos: Array<{ id: string; title?: string | null }>,
  quality: Quality,
  format: OutputFormat,
  title: string | null,
): Batch {
  const batch = new Batch(videos, quality, format, title, (job) => {
    jobs.set(job.id, job);
    batchJobs.add(job.id);
  });
  batches.set(batch.id, batch);
  armOrphanTimer(batch.id, () => batch.cancel());
  batch.start();
  return batch;
}

export const getJob = (id: string) => jobs.get(id);
export const getBatch = (id: string) => batches.get(id);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Remove finished downloads older than the TTL. Batch folders are removed as a
 * whole once every item has been finished for the TTL, so the ZIP stays
 * available while a long playlist is still downloading.
 */
async function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (batchJobs.has(id)) continue;
    if (job.completedAt && now - job.completedAt > config.fileTtlMs) {
      jobs.delete(id);
      subscribers.delete(id);
      await job.removeFiles();
    }
  }
  for (const [id, batch] of batches) {
    if (batch.finishedAt && now - batch.finishedAt > config.fileTtlMs) {
      batches.delete(id);
      subscribers.delete(id);
      for (const item of batch.items) {
        if (item.job) {
          jobs.delete(item.job.id);
          batchJobs.delete(item.job.id);
        }
      }
      await batch.removeFiles();
    }
  }
}

/**
 * On boot, delete leftover job folders from a previous run (their in-memory
 * state is gone, so they can never be served). Only UUID-named folders are
 * touched, so a misconfigured DOWNLOAD_DIR can't wipe unrelated files.
 */
async function removeStaleFolders() {
  await fs.mkdir(config.downloadDir, { recursive: true });
  const entries = await fs.readdir(config.downloadDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && UUID_RE.test(e.name) && !jobs.has(e.name) && !batches.has(e.name))
      .map((e) => fs.rm(path.join(config.downloadDir, e.name), { recursive: true, force: true })),
  );
}

export async function startCleanup(): Promise<void> {
  await removeStaleFolders();
  setInterval(() => void sweep().catch((e) => console.error('[cleanup]', e)), 60_000).unref();
}

/** Cancel everything (used on shutdown so no orphan yt-dlp processes remain). */
export function cancelAll() {
  for (const batch of batches.values()) batch.cancel();
  for (const job of jobs.values()) job.cancel();
}
