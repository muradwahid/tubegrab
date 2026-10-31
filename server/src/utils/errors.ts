export type ErrorCode =
  | 'INVALID_URL'
  | 'INVALID_REQUEST'
  | 'PRIVATE_VIDEO'
  | 'AGE_RESTRICTED'
  | 'REGION_BLOCKED'
  | 'UNAVAILABLE'
  | 'MEMBERS_ONLY'
  | 'LIVE_NOT_SUPPORTED'
  | 'BOT_CHECK'
  | 'PLAYLIST_TOO_LARGE'
  | 'NOT_FOUND'
  | 'NOT_READY'
  | 'YTDLP_MISSING'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'DOWNLOAD_FAILED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

interface Rule {
  test: RegExp;
  status: number;
  code: ErrorCode;
  message: string;
}

/** Ordered: the first matching rule wins. Patterns match yt-dlp's stderr wording. */
const RULES: Rule[] = [
  {
    test: /private video|this video is private|playlist does not exist|this playlist is private/i,
    status: 403,
    code: 'PRIVATE_VIDEO',
    message: 'This video or playlist is private.',
  },
  {
    test: /sign in to confirm your age|age[- ]restricted|inappropriate for some users/i,
    status: 403,
    code: 'AGE_RESTRICTED',
    message: 'This video is age-restricted and requires signing in, so it cannot be downloaded.',
  },
  {
    test: /not available in your country|blocked it in your country|geo[- ]?restrict|not made this video available in your country/i,
    status: 451,
    code: 'REGION_BLOCKED',
    message: 'This video is blocked in the server’s region.',
  },
  {
    test: /members[- ]only|join this channel to get access|available to this channel's members/i,
    status: 403,
    code: 'MEMBERS_ONLY',
    message: 'This video is for channel members only.',
  },
  {
    test: /premieres in|live event will begin|is_upcoming|this live event|is live|live stream/i,
    status: 422,
    code: 'LIVE_NOT_SUPPORTED',
    message: 'Live streams and upcoming premieres cannot be downloaded.',
  },
  {
    test: /sign in to confirm you.?re not a bot|http error 429|too many requests/i,
    status: 503,
    code: 'BOT_CHECK',
    message:
      'YouTube is temporarily blocking requests from this server (bot check / rate limit). Try again later.',
  },
  {
    test: /unsupported url|incomplete youtube id|is not a valid url|invalid (video|playlist) id/i,
    status: 400,
    code: 'INVALID_URL',
    message: 'That doesn’t look like a valid YouTube video or playlist link.',
  },
  {
    test: /video unavailable|this video is unavailable|has been removed|no longer available|account .* terminated|does not exist|not available|http error 404/i,
    status: 404,
    code: 'UNAVAILABLE',
    message: 'This video is unavailable. It may have been removed or made private.',
  },
];

/** Extract the most relevant ERROR line from yt-dlp stderr. */
export function lastYtdlpError(stderr: string): string {
  const lines = stderr.split(/\r?\n/).filter((l) => /^ERROR:/.test(l.trim()));
  return (lines.at(-1) ?? stderr.trim().split(/\r?\n/).at(-1) ?? '').trim();
}

export function mapYtdlpError(stderr: string): AppError {
  const line = lastYtdlpError(stderr);
  const haystack = line || stderr;
  for (const rule of RULES) {
    if (rule.test.test(haystack)) return new AppError(rule.status, rule.code, rule.message);
  }
  return new AppError(
    502,
    'DOWNLOAD_FAILED',
    line ? `Download failed: ${line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?(\S+:\s*)?/, '')}` : 'Download failed.',
  );
}
