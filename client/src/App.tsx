import { useState } from 'react';
import { ArrowDownToLine, RotateCcw, ShieldCheck } from 'lucide-react';
import { ToastProvider } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useHistory } from './hooks/useHistory';
import { useBackendStatus } from './hooks/useBackendStatus';
import { API_URL } from './api/client';
import type { HistoryItem, Mode } from './types';
import { ThemeToggle } from './components/ThemeToggle';
import { ModeTabs } from './components/ModeTabs';
import { Banner } from './components/Banner';
import { Toaster } from './components/Toaster';
import { HistoryPanel } from './components/HistoryPanel';
import { SingleVideoView } from './views/SingleVideoView';
import { PlaylistView } from './views/PlaylistView';

function Shell() {
  const { theme, toggle } = useTheme();
  const history = useHistory();
  const { state: backend, recheck } = useBackendStatus();
  const [mode, setMode] = useState<Mode>('single');
  const [urls, setUrls] = useState<Record<Mode, string>>({ single: '', playlist: '' });
  const [fetchSignals, setFetchSignals] = useState<Record<Mode, number>>({ single: 0, playlist: 0 });

  const setUrl = (m: Mode) => (value: string) => setUrls((u) => ({ ...u, [m]: value }));

  const switchToPlaylist = () => {
    setUrls((u) => ({ ...u, playlist: u.single }));
    setMode('playlist');
    setFetchSignals((s) => ({ ...s, playlist: s.playlist + 1 }));
  };

  const loadFromHistory = (item: HistoryItem) => {
    const m: Mode = item.kind === 'playlist' ? 'playlist' : 'single';
    setUrls((u) => ({ ...u, [m]: item.url }));
    setMode(m);
    setFetchSignals((s) => ({ ...s, [m]: s[m] + 1 }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[900px] flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <a href="/" className="flex items-center gap-2.5" aria-label="TubeGrab home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-lg shadow-red-500/25">
            <ArrowDownToLine className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="text-xl font-extrabold tracking-tight">
            Tube<span className="text-accent">Grab</span>
          </span>
        </a>
        <ThemeToggle theme={theme} onToggle={toggle} />
      </header>

      <main className="flex-1 space-y-6 pb-10">
        <section className="pt-4 text-center sm:pt-8">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Grab videos & playlists <span className="text-accent">in any quality</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 sm:text-lg dark:text-zinc-400">
            Paste a link, pick a resolution up to 4K or audio-only, and download — no sign-up.
          </p>
        </section>

        {backend.status === 'offline' && (
          <Banner
            variant="warning"
            title="Demo mode — the TubeGrab server isn’t reachable"
            action={
              <button type="button" className="btn-secondary py-2" onClick={() => void recheck()}>
                <RotateCcw className="h-4 w-4" /> Retry
              </button>
            }
          >
            This app needs its backend (Node + yt-dlp + ffmpeg) to fetch and download videos. Start it with{' '}
            <code className="rounded bg-black/10 px-1 dark:bg-white/10">npm run dev</code>, or deploy the{' '}
            <code className="rounded bg-black/10 px-1 dark:bg-white/10">/server</code> folder and set{' '}
            <code className="rounded bg-black/10 px-1 dark:bg-white/10">VITE_API_URL</code>. Currently trying{' '}
            <span className="break-all font-medium">{API_URL || window.location.origin}</span>.
          </Banner>
        )}
        {backend.status === 'online' && !backend.ytdlp && (
          <Banner variant="error" title="yt-dlp isn’t installed on the server">
            The API is running, but it can’t find the <code>yt-dlp</code> binary. See the README for install steps.
          </Banner>
        )}

        <div className="card space-y-6 p-4 sm:p-6">
          <ModeTabs mode={mode} onChange={setMode} />
          <div role="tabpanel" id="panel-single" aria-labelledby="tab-single" hidden={mode !== 'single'}>
            <SingleVideoView
              url={urls.single}
              onUrlChange={setUrl('single')}
              fetchSignal={fetchSignals.single}
              onSwitchToPlaylist={switchToPlaylist}
              onDownloaded={history.add}
            />
          </div>
          <div role="tabpanel" id="panel-playlist" aria-labelledby="tab-playlist" hidden={mode !== 'playlist'}>
            <PlaylistView
              url={urls.playlist}
              onUrlChange={setUrl('playlist')}
              fetchSignal={fetchSignals.playlist}
              onDownloaded={history.add}
            />
          </div>
        </div>

        <HistoryPanel items={history.items} onLoad={loadFromHistory} onRemove={history.remove} onClear={history.clear} />
      </main>

      <footer className="flex flex-col items-center gap-1 border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        <p className="inline-flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          Only download content you own or have permission to download.
        </p>
        <p>TubeGrab is not affiliated with YouTube or Google.</p>
      </footer>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
