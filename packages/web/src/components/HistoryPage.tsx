import { useEffect, useState } from 'react';
import { Dict } from '../i18n.js';

interface HistoryEntry {
  file: string;
  title: string;
  savedAt: string;
  moduleCount: number;
}

/** Standalone archive browser, served at /#/history by the FlowDeck host. */
export function HistoryPage({ dict }: { dict: Dict }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<{ title: string; summary: string } | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

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
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => (location.hash = '')}
          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
        >
          ← {dict.back}
        </button>
        <h1 className="text-lg font-semibold">FlowDeck · {dict.history}</h1>
      </div>

      {entries === null && <p className="text-sm text-zinc-400">…</p>}

      {entries?.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400">
          {dict.emptyHistory}
        </p>
      )}

      {selected ? (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h2 className="truncate font-medium">{selected.title}</h2>
            <button
              onClick={() => setSelected(null)}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
            >
              ← {dict.back}
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-zinc-700">
            {selected.summary}
          </pre>
        </div>
      ) : (
        entries &&
        entries.length > 0 && (
          <div className="space-y-2">
            {entries.map((e) => (
              <button
                key={e.file}
                onClick={() => openFile(e.file)}
                className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.title}</div>
                  <div className="text-xs text-zinc-400">
                    {e.savedAt.replace('T', ' ').slice(0, 19)} · {e.moduleCount} {dict.modulesUnit}
                  </div>
                </div>
                <span className="text-zinc-300">›</span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
