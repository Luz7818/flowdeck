import { useSyncExternalStore } from 'react';
import { safeStorage } from './storage.js';

export type Theme = 'light' | 'dark';

const KEY = 'flowdeck.theme';

/** stored choice wins; otherwise follow the system preference */
export function getInitialTheme(): Theme {
  const saved = safeStorage.get(KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function saveTheme(theme: Theme): void {
  safeStorage.set(KEY, theme);
}

/** React to .dark flips (theme toggle in a sibling component) without re-render trees. */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const observer = new MutationObserver(notify);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
  );
}
