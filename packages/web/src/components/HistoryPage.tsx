import { useEffect, useRef, useState } from 'react';
import { Dict, Lang } from '../i18n.js';
import { AppHeader } from './AppHeader.js';
import { ThemeToggle } from './ThemeToggle.js';
import { CanvasArt } from './CanvasArt.js';

interface HistoryEntry {
  file: string;
  title: string;
  savedAt: string;
  moduleCount: number;
}

interface SelectedEntry {
  file: string;
  title: string;
  summary: string;
  savedAt?: string;
  moduleCount?: number;
}

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace('T', ' ').slice(0, 19);
  return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Standalone archive browser, served at /#/history by the FlowDeck host. */
export function HistoryPage({ dict, lang }: { dict: Dict; lang: Lang }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<SelectedEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const armTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  const load = () => {
    setLoadError(false);
    setEntries(null);
    fetch('/api/history')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setEntries)
      .catch(() => {
        setEntries([]);
        setLoadError(true);
      });
  };

  useEffect(load, []);

  const openFile = async (file: string) => {
    try {
      const res = await fetch(`/api/history/file?name=${encodeURIComponent(file)}`);
      const json = await res.json();
      setSelected({
        file,
        title: json?.plan?.title ?? file,
        summary: json.summary ?? '',
        savedAt: typeof json?.savedAt === 'string' ? json.savedAt : undefined,
        moduleCount: Array.isArray(json?.plan?.modules) ? json.plan.modules.length : undefined,
      });
      setCopied(false);
      setArmed(false);
    } catch {
      /* ignore */
    }
  };

  const copySummary = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (non-secure context) — button is a no-op there */
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!armed) {
      // two-step confirm: first click arms for 3s, second click deletes
      setArmed(true);
      armTimer.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(false);
    try {
      const r = await fetch(`/api/history/file?name=${encodeURIComponent(selected.file)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(String(r.status));
      setSelected(null);
      load();
    } catch {
      setDeleteFailed(true);
      setTimeout(() => setDeleteFailed(false), 2500);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <AppHeader title={`FlowDeck · ${dict.history}`}>
        <ThemeToggle dict={dict} />
        <button
          onClick={() => (location.hash = '')}
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          ← {dict.back}
        </button>
      </AppHeader>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-6">
        {loadError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
            <span>{dict.historyError}</span>
            <button
              onClick={load}
              className="shrink-0 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-transparent dark:text-orange-300 dark:hover:bg-orange-500/20"
            >
              {dict.retry}
            </button>
          </div>
        )}

        {entries === null && !loadError && (
          <div className="animate-fade-in space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
            ))}
          </div>
        )}

        {entries?.length === 0 && (
          <div className="animate-pop-in rounded-2xl border border-dashed border-zinc-300 py-10 text-center dark:border-zinc-700">
            <CanvasArt className="mx-auto mb-4 h-20 w-56 opacity-90" />
            <p className="text-sm text-zinc-400 dark:text-zinc-600">{dict.emptyHistory}</p>
            <p className="mt-1 text-2xs text-zinc-300 dark:text-zinc-600">{dict.emptyHistoryHint}</p>
          </div>
        )}

        {selected ? (
          <div className="animate-slide-up overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="truncate font-medium">{selected.title}</h2>
                {(selected.savedAt || selected.moduleCount !== undefined) && (
                  <p className="mt-0.5 text-2xs text-zinc-500 dark:text-zinc-400">
                    {[selected.savedAt ? formatDate(selected.savedAt, lang) : null, selected.moduleCount !== undefined ? `${selected.moduleCount} ${dict.modulesUnit}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={copySummary}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    copied
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {copied ? dict.copied : dict.copy}
                </button>
                <button
                  onClick={deleteSelected}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    armed
                      ? 'border-red-300 bg-red-500 text-white hover:bg-red-600'
                      : 'border-zinc-200 bg-white text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-red-500/40 dark:hover:bg-red-500/15 dark:hover:text-red-400'
                  }`}
                >
                  {armed ? dict.confirmDelete : dict.delete}
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  ← {dict.back}
                </button>
              </div>
            </div>
            {deleteFailed && (
              <p className="border-b border-red-100 bg-red-50 px-4 py-1.5 text-2xs text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                {dict.deleteFailed}
              </p>
            )}
            <pre className="fd-scroll overflow-x-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {selected.summary}
            </pre>
          </div>
        ) : (
          entries &&
          entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((e, i) => (
                <button
                  key={e.file}
                  onClick={() => openFile(e.file)}
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  className="flex w-full animate-slide-up items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-card transition-[box-shadow] duration-200 hover:shadow-lift dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.title}</div>
                    <div className="mt-0.5 text-2xs text-zinc-500 dark:text-zinc-400">
                      {formatDate(e.savedAt, lang)} · {e.moduleCount} {dict.modulesUnit}
                    </div>
                  </div>
                  <span className="text-zinc-300 dark:text-zinc-600">›</span>
                </button>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
}
