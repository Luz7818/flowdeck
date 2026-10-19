import { useState } from 'react';
import { Dict } from '../i18n.js';

/** Ghost row between cards: click to expand a tiny form that inserts a new step. */
export function InsertCard({
  dict,
  onInsert,
}: {
  dict: Dict;
  onInsert: (title: string, detail?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-1.5 text-2xs text-zinc-400 hover:border-zinc-400 hover:bg-white hover:text-zinc-600"
      >
        + {dict.insert}
      </button>
    );
  }

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onInsert(t, detail.trim() || undefined);
    setTitle('');
    setDetail('');
    setOpen(false);
  };
  const close = () => {
    setTitle('');
    setDetail('');
    setOpen(false);
  };

  return (
    <div className="animate-slide-up rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') close();
        }}
        placeholder={dict.titlePh}
        className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') close();
        }}
        placeholder={dict.detailPh}
        className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={close}
          className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
        >
          {dict.cancel}
        </button>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {dict.add}
        </button>
      </div>
    </div>
  );
}
