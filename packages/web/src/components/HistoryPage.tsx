import { useEffect, useState } from 'react';
import { Dict, Lang } from '../i18n.js';
import { AppHeader } from './AppHeader.js';

interface HistoryEntry {
  file: string;
  title: string;
  savedAt: string;
  moduleCount: number;
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
  const [selected, setSelected] = useState<{ title: string; summary: string } | null>(null);

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
      setSelected({ title: json?.plan?.title ?? file, summary: json.summary ?? '' });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-full flex-col">
      <AppHeader title={`FlowDeck · ${dict.history}`}>
        <button
          onClick={() => (location.hash = '')}
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        >
          ← {dict.back}
        </button>
      </AppHeader>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-6">
        {loadError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            <span>{dict.historyError}</span>
            <button
              onClick={load}
              className="shrink-0 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
            >
              {dict.retry}
            </button>
          </div>
        )}

        {entries === null && !loadError && (
          <div className="animate-fade-in space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-zinc-200 bg-white" />
            ))}
          </div>
        )}

        {entries?.length === 0 && (
          <div className="animate-pop-in rounded-2xl border border-dashed border-zinc-300 py-12 text-center">
            <div className="mx-auto mb-3 grid w-fit grid-cols-2 gap-1.5 opacity-40">
              <span className="h-3 w-3 rounded-[4px] bg-zinc-400" />
              <span className="h-3 w-3 rounded-[4px] bg-zinc-300" />
              <span className="h-3 w-3 rounded-[4px] bg-zinc-300" />
              <span className="h-3 w-3 rounded-[4px] bg-zinc-200" />
            </div>
            <p className="text-sm text-zinc-400">{dict.emptyHistory}</p>
          </div>
        )}

        {selected ? (
          <div className="animate-slide-up overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <h2 className="truncate font-medium">{selected.title}</h2>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
              >
                ← {dict.back}
              </button>
            </div>
            <pre className="fd-scroll overflow-x-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-zinc-700">
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
                  className="flex w-full animate-slide-up items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-card transition-[box-shadow] duration-200 hover:shadow-lift"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.title}</div>
                    <div className="mt-0.5 text-2xs text-zinc-400">
                      {formatDate(e.savedAt, lang)} · {e.moduleCount} {dict.modulesUnit}
                    </div>
                  </div>
                  <span className="text-zinc-300">›</span>
                </button>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
}
