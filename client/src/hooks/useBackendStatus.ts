import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onReachabilityChange } from '../api/client';

export type BackendState =
  | { status: 'checking' }
  | { status: 'online'; ytdlp: string | null; maxPlaylistSize: number }
  | { status: 'offline' };

/**
 * "Demo mode": checks the API on load and listens for network failures from
 * any request, so the UI can explain that the backend must be running/deployed
 * instead of crashing.
 */
export function useBackendStatus() {
  const [state, setState] = useState<BackendState>({ status: 'checking' });
  const stateRef = useRef(state);
  stateRef.current = state;

  const check = useCallback(async () => {
    try {
      const h = await api.health();
      setState({ status: 'online', ytdlp: h.ytdlp, maxPlaylistSize: h.maxPlaylistSize });
    } catch {
      setState({ status: 'offline' });
    }
  }, []);

  useEffect(() => {
    void check();
    return onReachabilityChange((reachable) => {
      if (!reachable) setState({ status: 'offline' });
      else if (stateRef.current.status === 'offline') void check();
    });
  }, [check]);

  return { state, recheck: check };
}
