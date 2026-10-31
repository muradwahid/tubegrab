import type { Request, Response } from 'express';

export interface SseChannel {
  send: (event: string, data: unknown) => void;
  close: () => void;
  onClose: (fn: () => void) => void;
}

/** Open a Server-Sent Events stream with heartbeats; cleans up on disconnect. */
export function openSse(req: Request, res: Response): SseChannel {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx/Render)
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const closeHandlers: Array<() => void> = [];
  let closed = false;

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 15_000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    for (const fn of closeHandlers) fn();
  };
  req.on('close', cleanup);

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      cleanup();
      res.end();
    },
    onClose(fn) {
      closeHandlers.push(fn);
    },
  };
}
