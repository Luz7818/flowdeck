import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'flowdeck.theme';

/** stored choice wins; otherwise follow the system preference */
export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* storage unavailable — fall through to the system preference */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode — the toggle still works for this page view */
  }
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
