import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

/**
 * YouTube "player client" fallback.
 *
 * From cloud IPs (Vercel, AWS…) YouTube often answers yt-dlp's default
 * clients with "Sign in to confirm you're not a bot", while other clients
 * (TV, embedded, mobile) may still be served. When a call fails with that bot
 * check we retry with the next client, and remember the first one that works
 * so later calls on this instance start with it.
 *
 * "default" = yt-dlp's own client selection (no extractor args).
 * Override the order with YTDLP_CLIENT_FALLBACK (comma-separated, "off" to disable).
 */
// Order tested against yt-dlp 2026.10: embedded clients return the full format
// list; the mobile/VR/simple-TV ones only a single progressive format (last resort).
const DEFAULT_ORDER = ['default', 'tv_embedded', 'web_embedded', 'android_vr', 'mweb', 'tv_simply', 'android'];

function configuredOrder(): string[] {
  // An explicit YTDLP_EXTRACTOR_ARGS means the operator chose the client; don't fight it.
  if (config.ytdlpExtractorArgs) return ['default'];
  const raw = config.ytdlpClientFallback;
  if (!raw) return DEFAULT_ORDER;
  if (raw === 'off') return ['default'];
  const list = raw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^[a-z_]+$/.test(c));
  return list.length ? list : DEFAULT_ORDER;
}

let preferred: string | null = null;
/** Last outcome per client: "ok" or the yt-dlp error line. */
const lastResult = new Map<string, string>();

/** Strategies to try, last known-good first. */
export function clientOrder(): string[] {
  const order = configuredOrder();
  return preferred && order.includes(preferred) ? [preferred, ...order.filter((c) => c !== preferred)] : order;
}

/** yt-dlp arguments for a strategy. */
export function clientArgs(client: string): string[] {
  return client === 'default' ? [] : ['--extractor-args', `youtube:player_client=${client}`];
}

export function reportClient(client: string, ok: boolean, err?: unknown): void {
  lastResult.set(client, ok ? 'ok' : describe(err));
  if (ok) {
    if (preferred !== client) console.log(`[tubegrab] YouTube client "${client}" works; using it first from now on`);
    preferred = client;
  } else if (preferred === client) {
    preferred = null;
  }
}

/** For the status page: which client currently works and what was tried. */
export function clientStatus() {
  return { preferred, tried: Object.fromEntries(lastResult) };
}

function describe(err: unknown): string {
  if (err instanceof AppError) return `${err.code}: ${err.raw ?? err.message}`.slice(0, 220);
  return 'failed';
}

export const isBotCheck = (err: unknown): boolean => err instanceof AppError && err.code === 'BOT_CHECK';

/**
 * Whether to try the next client after `err`. Bot checks always continue. Once
 * a bot check has been seen, unknown failures (a client that is broken or has
 * no formats) continue too; definitive answers such as private, unavailable or
 * age-restricted stop immediately.
 */
export function shouldTryNextClient(err: unknown, sawBotCheck: boolean): boolean {
  if (isBotCheck(err)) return true;
  return sawBotCheck && err instanceof AppError && err.code === 'DOWNLOAD_FAILED';
}

/** Run `fn` with each client strategy until one isn't bot-checked. */
export async function withClientFallback<T>(fn: (extraArgs: string[]) => Promise<T>): Promise<T> {
  const order = clientOrder();
  let botCheckErr: unknown = null;
  const attempts: Record<string, string> = {};
  for (const [i, client] of order.entries()) {
    try {
      const result = await fn(clientArgs(client));
      reportClient(client, true);
      return result;
    } catch (err) {
      attempts[client] = describe(err);
      if (err instanceof AppError && Object.keys(attempts).length > 1) err.details = { clients: { ...attempts } };
      if (!shouldTryNextClient(err, botCheckErr !== null)) throw err;
      reportClient(client, false, err);
      botCheckErr ??= err;
      if (botCheckErr instanceof AppError) botCheckErr.details = { clients: { ...attempts } };
      if (i < order.length - 1) console.warn(`[tubegrab] client "${client}" failed (${(err as AppError).code}), retrying with "${order[i + 1]}"`);
    }
  }
  // Every client failed: report the bot check, which is the actionable cause.
  throw botCheckErr;
}
