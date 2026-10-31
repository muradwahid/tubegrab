const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const MAX_BYTES = 180;

/**
 * Make a string safe to use as a filename on Windows, macOS and Linux.
 * Removes reserved characters, control chars, trailing dots/spaces and
 * Windows reserved device names, then truncates to a safe byte length.
 */
export function sanitizeFilename(input: string, fallback = 'video'): string {
  let name = input
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s*:\s*/g, ' - ')
    .replace(/[/\\|]/g, '-')
    .replace(/[<>"?*]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');

  if (RESERVED_WINDOWS.test(name)) name = `_${name}`;

  // Truncate by UTF-8 bytes without splitting a code point.
  if (Buffer.byteLength(name, 'utf8') > MAX_BYTES) {
    let out = '';
    for (const ch of name) {
      if (Buffer.byteLength(out + ch, 'utf8') > MAX_BYTES) break;
      out += ch;
    }
    name = out.trim().replace(/[.\s]+$/g, '');
  }
  return name || fallback;
}
