export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i === 0 || v >= 100 ? 0 : digits)} ${units[i]}`;
}

export function formatSpeed(bps: number | null | undefined): string {
  return bps ? `${formatBytes(bps)}/s` : '—';
}

/** 75 → "1:15", 3725 → "1:02:05" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  return formatDuration(seconds);
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export function formatViews(n: number | null | undefined): string | null {
  return n === null || n === undefined ? null : `${compact.format(n)} views`;
}

/** "20050424" → localized date */
export function formatUploadDate(d: string | null | undefined): string | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  const date = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (diff < 60) return 'just now';
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

const YT_HOST = /(^|\.)(youtube\.com|youtu\.be)$/i;

export function looksLikeYouTubeUrl(value: string): boolean {
  try {
    const u = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return YT_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export function isPlaylistUrl(value: string): boolean {
  return /[?&]list=[\w-]+/.test(value);
}

/** Trigger a browser download for an attachment URL without leaving the page. */
export function triggerDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');
