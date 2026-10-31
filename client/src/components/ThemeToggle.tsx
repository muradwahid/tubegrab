import { Moon, Sun } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';

interface Props {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: Props) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      className="btn-ghost h-10 w-10 p-0"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
