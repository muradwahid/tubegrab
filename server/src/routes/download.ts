import { Router } from 'express';
import { AppError } from '../utils/errors.js';
import { parseVideoUrl } from '../utils/validateUrl.js';
import { openSse } from '../utils/sse.js';
import { createJob, getJob, subscribe } from '../services/jobs.js';
import { param, parseQualityAndFormat } from './helpers.js';
import type { RateLimitRequestHandler } from 'express-rate-limit';

export function downloadRouter(limiter: RateLimitRequestHandler) {
  const router = Router();

  router.post('/download', limiter, (req, res) => {
    const { url } = parseVideoUrl(req.body?.url);
    const { quality, format } = parseQualityAndFormat(req.body);
    const job = createJob(url, quality, format);
    res.status(202).json({ jobId: job.id });
  });

  router.get('/progress/:jobId', (req, res) => {
    const job = getJob(param(req, 'jobId'));
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Download not found or expired.');

    const sse = openSse(req, res);
    sse.send('progress', job.snapshot);
    if (job.isTerminal) {
      sse.close();
      return;
    }
    const onUpdate = (s: unknown) => sse.send('progress', s);
    // The final snapshot was already delivered via "update"; just end the stream.
    const onFinished = () => sse.close();
    job.on('update', onUpdate);
    job.once('finished', onFinished);
    const unsubscribe = subscribe(job.id, () => job.cancel());
    sse.onClose(() => {
      job.off('update', onUpdate);
      job.off('finished', onFinished);
      unsubscribe();
    });
  });

  router.delete('/download/:jobId', (req, res) => {
    const job = getJob(param(req, 'jobId'));
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Download not found or expired.');
    job.cancel();
    res.json({ ok: true, status: job.snapshot.status });
  });

  router.get('/file/:jobId', (req, res) => {
    const job = getJob(param(req, 'jobId'));
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Download not found or expired.');
    const { status, filename } = job.snapshot;
    if (status !== 'done' || !job.filePath) {
      throw new AppError(409, 'NOT_READY', 'This file is not ready yet.');
    }
    res.download(job.filePath, filename ?? 'video.mp4', { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) {
        res.status(410).json({ error: { code: 'NOT_FOUND', message: 'The file has expired.' } });
      }
    });
  });

  return router;
}
