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

/** youtube.com/@handle, /channel/UC…, /c/name or /user/name (no video ID). */
export function isChannelUrl(value: string): boolean {
  try {
    const u = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    if (!/(^|\.)youtube\.com$/i.test(u.hostname) || u.searchParams.get('v')) return false;
    return /^\/(@[^/]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
}

export interface UploadRange {
  /** Earliest / latest possible upload day, as YYYY-MM-DD. */
  from: string;
  to: string;
  /** What YouTube shows, e.g. "3 weeks ago", or the exact date when recent. */
  label: string;
  /** Tooltip, e.g. "Uploaded between Sep 3 and Oct 2, 2026". */
  title: string;
  exact: boolean;
}

const DAY = 86_400_000;
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const shortDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/**
 * Turn a listing's approximate upload date back into the range it stands for.
 * YouTube channel/playlist pages only say "2 weeks ago", "1 month ago" or
 * "3 years ago", and yt-dlp converts that to (today − N units), so a video
 * listed as "1 month ago" was uploaded somewhere in that whole month.
 */
export function uploadRange(ymd: string | null | undefined, now = Date.now()): UploadRange | null {
  if (!ymd || !/^\d{8}$/.test(ymd)) return null;
  const d = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  const age = Math.max(0, Math.round((now - d) / DAY));
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  const back = (t: number, months: number) => {
    const x = new Date(t);
    x.setUTCMonth(x.getUTCMonth() - months);
    return x.getTime();
  };
  let from: number;
  let label: string;
  if (age < 7) {
    return { from: isoOf(d), to: isoOf(d), label: shortDate(d), title: `Uploaded ${shortDate(d)}`, exact: true };
  } else if (age < 30) {
    from = d - 6 * DAY;
    label = plural(Math.round(age / 7), 'week');
  } else if (age < 365) {
    from = back(d, 1) + DAY;
    label = plural(Math.max(1, Math.round(age / 30.44)), 'month');
  } else {
    from = back(d, 12) + DAY;
    label = plural(Math.max(1, Math.round(age / 365.25)), 'year');
  }
  return { from: isoOf(from), to: isoOf(d), label, title: `Uploaded between ${shortDate(from)} and ${shortDate(d)} (YouTube shows “${label}”)`, exact: false };
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
