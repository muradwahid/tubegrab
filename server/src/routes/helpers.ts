import type { Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { isOutputFormat, isQuality, type OutputFormat, type Quality } from '../services/formats.js';

/** An AbortSignal that fires if the client disconnects before we respond. */
export function abortOnClose(req: Request, res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  void req;
  return controller.signal;
}

export function parseQualityAndFormat(body: unknown): { quality: Quality; format: OutputFormat } {
  const b = (body ?? {}) as Record<string, unknown>;
  const quality = b.resolution ?? b.quality;
  const format = b.format ?? 'mp4';
  if (!isQuality(quality)) {
    throw new AppError(400, 'INVALID_REQUEST', 'Invalid resolution. Use e.g. "1080p", "720p", "mp3" or "m4a".');
  }
  if (!isOutputFormat(format)) {
    throw new AppError(400, 'INVALID_REQUEST', 'Invalid format. Use "mp4" or "webm".');
  }
  return { quality, format };
}

export function param(req: Request, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/.test(v)) {
    throw new AppError(404, 'NOT_FOUND', 'Download not found or expired.');
  }
  return v;
}
