import { useCallback, useEffect, useState } from 'react';
import type { HistoryItem } from '../types';

const KEY = 'tubegrab:history';
const MAX_ITEMS = 10;

function load(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryItem[]).slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function save(items: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or unavailable */
  }
}

/** Recent downloads, newest first, capped at 10 and synced across tabs. */
export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>(load);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((item: Omit<HistoryItem, 'id' | 'createdAt'>) => {
    setItems((prev) => {
      const next = [
        { ...item, id: crypto.randomUUID(), createdAt: Date.now() },
        ...prev.filter((p) => !(p.url === item.url && p.detail === item.detail)),
      ].slice(0, MAX_ITEMS);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    save([]);
  }, []);

  return { items, add, remove, clear };
}
