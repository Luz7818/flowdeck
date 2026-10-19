import { ReactNode } from 'react';

/** shared frosted header: logo tile + title + right-side actions */
export function AppHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
        <div className="grid grid-cols-2 gap-[3px] rounded-[10px] border border-zinc-200 bg-white p-1.5 shadow-card">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-blue-600" />
          <span className="h-2.5 w-2.5 rounded-[3px] bg-violet-500" />
          <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
          <span className="h-2.5 w-2.5 rounded-[3px] bg-amber-500" />
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">{title}</div>
        {children}
      </div>
    </header>
  );
}
