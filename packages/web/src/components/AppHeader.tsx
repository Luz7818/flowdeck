import { ReactNode } from 'react';

/** shared frosted header: brand stamp + title + right-side actions.
 *  The stamp is the canvas header's mark (four node tiles crossed by an X of
 *  wires through a center dot) — both surfaces speak the same brand. */
export function AppHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/75">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
        <div className="hidden shrink-0 rounded-[10px] border border-zinc-200 bg-white p-1.5 shadow-card sm:block dark:border-zinc-700 dark:bg-zinc-900">
          <svg viewBox="0 0 30 30" className="h-7 w-7" aria-hidden>
            <rect x="2" y="2" width="12" height="12" rx="3.5" fill="#2563eb" />
            <rect x="16" y="2" width="12" height="12" rx="3.5" fill="#a855f7" />
            <rect x="2" y="16" width="12" height="12" rx="3.5" fill="#10b981" />
            <rect x="16" y="16" width="12" height="12" rx="3.5" fill="#f59e0b" />
            <path d="M9.4 9.4 20.6 20.6M20.6 9.4 9.4 20.6" stroke="rgb(255 255 255 / 0.9)" strokeWidth="1.6" />
            <circle cx="15" cy="15" r="2.6" fill="#fff" />
          </svg>
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">{title}</div>
        {children}
      </div>
    </header>
  );
}
