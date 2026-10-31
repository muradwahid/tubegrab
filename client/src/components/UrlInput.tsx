import { useRef, type FormEvent } from 'react';
import { ClipboardPaste, Link2, LoaderCircle, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  submitLabel: string;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  onPasteError?: (message: string) => void;
}

/** Large URL field with Paste (clipboard) and Clear buttons, plus a submit action. */
export function UrlInput({
  value,
  onChange,
  onSubmit,
  submitLabel,
  placeholder = 'Paste a YouTube link…',
  loading = false,
  disabled = false,
  onPasteError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !loading) onSubmit(trimmed);
  };

  const paste = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('unsupported');
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        onPasteError?.('Your clipboard is empty.');
        return;
      }
      onChange(text);
      inputRef.current?.focus();
    } catch {
      onPasteError?.('Clipboard access was blocked — press Ctrl+V / ⌘V instead.');
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Link2
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="YouTube URL"
          className="h-14 w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-32 text-base sm:pr-36 text-zinc-900 placeholder:text-zinc-400 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Clear URL"
              title="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={paste}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label="Paste from clipboard"
          >
            <ClipboardPaste className="h-4 w-4" />
            <span className="hidden sm:inline">Paste</span>
          </button>
        </div>
      </div>
      <button
        type="submit"
        disabled={disabled || loading || !value.trim()}
        className="btn-primary h-14 px-6 text-base sm:min-w-40"
      >
        {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
        {loading ? 'Fetching…' : submitLabel}
      </button>
    </form>
  );
}
