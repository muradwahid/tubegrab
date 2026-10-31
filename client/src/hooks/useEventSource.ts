import { useEffect, useRef } from 'react';

/**
 * Subscribe to a Server-Sent Events URL and receive parsed "progress" events.
 * Return `true` from `onMessage` to close the stream (e.g. on a terminal state);
 * otherwise EventSource auto-reconnects on network blips.
 */
export function useEventSource<T>(
  url: string | null,
  onMessage: (data: T) => boolean | void,
  onConnectionLost?: () => void,
) {
  const handler = useRef(onMessage);
  const lost = useRef(onConnectionLost);
  handler.current = onMessage;
  lost.current = onConnectionLost;

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    let failures = 0;
    es.addEventListener('progress', (e) => {
      failures = 0;
      try {
        if (handler.current(JSON.parse((e as MessageEvent<string>).data) as T) === true) es.close();
      } catch (err) {
        console.error('Bad SSE payload', err);
      }
    });
    es.onerror = () => {
      // CLOSED means the browser gave up (e.g. 404 for an expired job).
      failures += 1;
      if (es.readyState === EventSource.CLOSED || failures >= 5) {
        es.close();
        lost.current?.();
      }
    };
    return () => es.close();
  }, [url]);
}
