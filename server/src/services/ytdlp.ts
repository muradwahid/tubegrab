import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { config } from '../config.js';
import { AppError, mapYtdlpError } from '../utils/errors.js';

/**
 * Arguments shared by every yt-dlp invocation. User input is NEVER placed in
 * a shell string: we always spawn with an argument array and pass the URL
 * after "--" so it cannot be interpreted as an option.
 */
export function baseArgs(): string[] {
  const args = ['--ignore-config', '--color', 'never'];
  // YouTube needs a JS runtime to solve player challenges; reuse the Node
  // binary that is running this server (yt-dlp only enables Deno by default).
  args.push('--js-runtimes', `node:${process.execPath}`);
  if (config.ffmpegPath !== 'ffmpeg') args.push('--ffmpeg-location', config.ffmpegPath);
  return args;
}

export function spawnYtdlp(args: string[]): ChildProcess {
  const extra: string[] = [];
  if (config.ytdlpProxy) extra.push('--proxy', config.ytdlpProxy);
  if (config.ytdlpExtractorArgs) extra.push('--extractor-args', config.ytdlpExtractorArgs);

  // yt-dlp rewrites its cookie file on exit, so each process gets a private
  // copy (concurrent downloads would otherwise clobber a shared file).
  let cookieFile: string | null = null;
  if (config.ytdlpCookies) {
    cookieFile = path.join(os.tmpdir(), `tubegrab-cookies-${randomUUID()}.txt`);
    fs.writeFileSync(cookieFile, config.ytdlpCookies, { mode: 0o600 });
    extra.push('--cookies', cookieFile);
  }

  const child = spawn(config.ytdlpPath, [...extra, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group on POSIX so we can kill yt-dlp *and* its ffmpeg children.
    detached: process.platform !== 'win32',
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
  });

  if (cookieFile) {
    const file = cookieFile;
    const remove = () => fs.rm(file, { force: true }, () => undefined);
    child.once('close', remove);
    child.once('error', remove);
  }
  return child;
}

/** Kill a yt-dlp process and any ffmpeg children it spawned. */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const pid = child.pid;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  const force = setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }, 3000);
  force.unref();
  child.once('exit', () => clearTimeout(force));
}

export function onLines(child: ChildProcess, fn: (line: string, stream: 'stdout' | 'stderr') => void) {
  if (child.stdout) readline.createInterface({ input: child.stdout }).on('line', (l) => fn(l, 'stdout'));
  if (child.stderr) readline.createInterface({ input: child.stderr }).on('line', (l) => fn(l, 'stderr'));
}

function spawnError(err: NodeJS.ErrnoException): AppError {
  if (err.code === 'ENOENT') {
    return new AppError(
      500,
      'YTDLP_MISSING',
      'yt-dlp is not installed on the server. See the README for installation steps.',
    );
  }
  return new AppError(500, 'INTERNAL', `Failed to start yt-dlp: ${err.message}`);
}

/** Run yt-dlp and parse its stdout as JSON (for --dump-json style calls). */
export function runYtdlpJson<T>(
  args: string[],
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const { timeoutMs = 90_000, signal } = opts;
  return new Promise<T>((resolve, reject) => {
    const child = spawnYtdlp([...baseArgs(), ...args]);
    const out: Buffer[] = [];
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => {
      killTree(child);
      finish(() => reject(new AppError(499, 'INTERNAL', 'Request cancelled.')));
    };
    const timer = setTimeout(() => {
      killTree(child);
      finish(() => reject(new AppError(504, 'TIMEOUT', 'YouTube took too long to respond. Please try again.')));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (c: Buffer) => out.push(c));
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
    });
    child.on('error', (err) => finish(() => reject(spawnError(err))));
    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          console.warn('[yt-dlp] exited with code', code, '\n', stderr.trim().slice(-2000));
          reject(mapYtdlpError(stderr));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(out).toString('utf8')) as T);
        } catch {
          reject(new AppError(502, 'INTERNAL', 'Could not read the response from yt-dlp.'));
        }
      });
    });
  });
}

/** Run `<bin> <args>` and return the first line of stdout, or null if it can't run. */
function binaryVersion(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? (out.split(/\r?\n/)[0]?.trim() ?? null) : null));
  });
}

/** Installed yt-dlp version, e.g. "2026.10.26", or null if missing. */
export const getYtdlpVersion = () => binaryVersion(config.ytdlpPath, ['--version']);

/** Installed ffmpeg version, e.g. "9.0", or null if missing. */
export async function getFfmpegVersion(): Promise<string | null> {
  const line = await binaryVersion(config.ffmpegPath, ['-version']);
  return line?.match(/ffmpeg version (\S+)/)?.[1] ?? line;
}

export { spawnError };
