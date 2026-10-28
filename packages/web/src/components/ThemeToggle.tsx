import { useEffect, useState } from 'react';
import { applyTheme, getInitialTheme, saveTheme, type Theme } from '../theme.js';
import { Dict } from '../i18n.js';

/** dark/light switch — initial value follows the system, choice persists */
export function ThemeToggle({ dict }: { dict: Dict }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    // cross-fade the palette swap: color properties only, then drop the class so
    // it never competes with the motion system's transform transitions
    const root = document.documentElement;
    root.classList.add('fd-theme-anim');
    window.setTimeout(() => root.classList.remove('fd-theme-anim'), 350);
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={dict.theme}
      aria-pressed={theme === 'dark'}
      title={dict.theme}
      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden>
          <circle cx="7" cy="7" r="2.6" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M7 1.2v1.4M7 11.4v1.4M1.2 7h1.4M11.4 7h1.4M2.9 2.9l1 1M10.1 10.1l1 1M11.1 2.9l-1 1M3.9 10.1l-1 1" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden>
          <path
            d="M11.6 8.8A5 5 0 0 1 5.2 2.4a5 5 0 1 0 6.4 6.4Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}
