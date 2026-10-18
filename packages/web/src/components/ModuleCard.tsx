import { ReactNode, useEffect, useRef, useState } from 'react';
import { PlanModule } from '@flowdeck/core';
import { Dict } from '../i18n.js';

const DOT: Record<string, string> = {
  step: 'bg-blue-500',
  question: 'bg-amber-500',
  suggestion: 'bg-violet-500',
  risk: 'bg-orange-500',
  checkpoint: 'bg-emerald-500',
  resource: 'bg-zinc-400',
};

/** commit-on-blur editable text (span → contentEditable) */
export function EditableText({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing && ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  });

  // the browser decides focus on mousedown, before React flips contentEditable —
  // focus programmatically once editable so the first click lands with a caret
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [editing]);

  return (
    <span
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={false}
      role={editing ? 'textbox' : undefined}
      tabIndex={editing ? undefined : 0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (!editing && e.key === 'Enter') {
          e.preventDefault();
          setEditing(true);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          if (ref.current) ref.current.textContent = value;
          setEditing(false);
        }
      }}
      onBlur={() => {
        setEditing(false);
        const next = (ref.current?.textContent ?? '').trim();
        if (next && next !== value) onCommit(next);
        else if (ref.current) ref.current.textContent = value;
      }}
      data-placeholder={!value ? placeholder : undefined}
      className={`${className ?? ''} outline-none rounded focus:bg-amber-50 focus:ring-2 focus:ring-amber-200 px-0.5 -mx-0.5 ${editing ? '' : value ? '' : 'text-zinc-400'}`}
    />
  );
}

function RemoveBtn({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <button
      aria-label={title}
      onClick={onRemove}
      className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-md text-zinc-300 opacity-100 transition-all hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function ModuleCard({
  mod,
  index,
  stepTitles,
  lang,
  dict,
  dragHandle,
  onChange,
  onRemove,
  onConvert,
  toggleCollapsed,
}: {
  mod: PlanModule;
  index: number;
  stepTitles: Map<string, string>;
  lang: 'zh' | 'en';
  dict: Dict;
  dragHandle?: ReactNode;
  onChange: (next: PlanModule) => void;
  onRemove: () => void;
  onConvert?: () => void;
  toggleCollapsed?: () => void;
}) {
  const base =
    'fd-card group relative rounded-xl border border-zinc-200 bg-white shadow-card hover:shadow-lift [overflow-wrap:anywhere]';

  switch (mod.type) {
    case 'group':
      return (
        <div className="flex items-center gap-3 pt-6 first:pt-0">
          <div className="h-px flex-1 bg-zinc-200" />
          <button
            onClick={toggleCollapsed}
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <svg
              viewBox="0 0 12 12"
              className={`h-3 w-3 transition-transform ${mod.collapsed ? '-rotate-90' : ''}`}
            >
              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {mod.title}
          </button>
          {dragHandle}
          <RemoveBtn title={dict.remove} onRemove={onRemove} />
          <div className="h-px flex-1 bg-zinc-200" />
        </div>
      );

    case 'step': {
      const deps = (mod.dependsOn ?? [])
        .map((id) => stepTitles.get(id))
        .filter((t): t is string => Boolean(t));
      return (
        <div className={`${base} p-3.5 ${mod.excluded ? 'opacity-45' : ''}`}>
          <RemoveBtn title={dict.remove} onRemove={onRemove} />
          <div className="flex items-start gap-2.5">
            {dragHandle}
            <button
              aria-label={mod.excluded ? dict.keep : dict.excluded}
              onClick={() => onChange({ ...mod, excluded: !mod.excluded })}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                mod.excluded
                  ? 'border-zinc-300 bg-zinc-100'
                  : 'border-blue-500 bg-blue-500 text-white'
              }`}
            >
              {!mod.excluded && (
                <svg viewBox="0 0 12 12" className="h-3 w-3">
                  <path d="M2 6.5 4.8 9 10 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-6">
                <span className="text-[11px] font-medium tabular-nums text-zinc-400">
                  {String(index).padStart(2, '0')}
                </span>
                <EditableText
                  value={mod.title}
                  onCommit={(title) => onChange({ ...mod, title })}
                  className={`font-medium ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}
                  placeholder={dict.titlePh}
                />
                {deps.map((t) => (
                  <button
                    key={t}
                    title={`${dict.dependsOn}: ${t}`}
                    onClick={() =>
                      onChange({
                        ...mod,
                        dependsOn: mod.dependsOn?.filter((id) => stepTitles.get(id) !== t),
                      })
                    }
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-zinc-200"
                  >
                    ← {t}
                  </button>
                ))}
              </div>
              {(mod.detail || null) && (
                <p className="mt-1 pr-6 text-sm leading-relaxed text-zinc-500">
                  <EditableText
                    value={mod.detail ?? ''}
                    onCommit={(detail) => onChange({ ...mod, detail: detail || undefined })}
                    placeholder={dict.detailPh}
                  />
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    case 'question':
      return (
        <div className={`${base} border-amber-200 p-4 ${mod.excluded ? 'opacity-45' : ''}`}>
          <RemoveBtn title={dict.remove} onRemove={onRemove} />
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600">
            <span className={`h-2 w-2 rounded-full ${DOT.question}`} />
            {dict.question}
          </div>
          <p className={`mt-2 pr-6 font-medium ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}>
            {mod.question}
          </p>
          {!mod.excluded && (
            <div className="mt-3 flex flex-wrap gap-2">
              {mod.options.map((opt) => {
                const active = mod.answer === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => onChange({ ...mod, answer: active ? null : opt })}
                    className={`fd-chip flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                      active
                        ? 'fd-chip-on border-amber-500 bg-amber-500 text-white shadow-sm'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-amber-300 hover:bg-amber-50'
                    }`}
                  >
                    {active && (
                      <svg viewBox="0 0 12 12" className="fd-check h-3 w-3">
                        <path d="M2 6.5 4.8 9 10 3.5" pathLength="1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );

    case 'suggestion':
      return (
        <div
          className={`${base} border-violet-200 p-4 ${mod.adopted ? 'ring-2 ring-violet-400' : ''} ${mod.excluded ? 'opacity-45' : ''}`}
        >
          <RemoveBtn title={dict.remove} onRemove={onRemove} />
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600">
              <span className={`h-2 w-2 rounded-full ${DOT.suggestion}`} />
              {dict.suggestion}
            </div>
            <div className="flex gap-1.5">
              {onConvert && !mod.adopted && !mod.excluded && (
                <button
                  onClick={onConvert}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200"
                >
                  {dict.toStep}
                </button>
              )}
              <button
                onClick={() => onChange({ ...mod, adopted: !mod.adopted })}
                className={`fd-chip rounded-full px-3 py-1 text-xs font-medium ${
                  mod.adopted ? 'fd-chip-on bg-violet-500 text-white' : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                }`}
              >
                {mod.adopted ? dict.adopted : dict.adopt}
              </button>
            </div>
          </div>
          <p className={`mt-2 pr-6 font-medium ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}>
            {mod.title}
          </p>
          {mod.detail && <p className="mt-1 pr-6 text-sm text-zinc-500">{mod.detail}</p>}
        </div>
      );

    case 'risk': {
      const level = mod.level ?? 'warn';
      const border =
        level === 'danger' ? 'border-red-300 bg-red-50/60' : level === 'warn' ? 'border-orange-200 bg-orange-50/60' : 'border-sky-200 bg-sky-50/60';
      const text = level === 'danger' ? 'text-red-600' : level === 'warn' ? 'text-orange-600' : 'text-sky-600';
      const lvLabel = level === 'danger' ? dict.lvDanger : level === 'info' ? dict.lvInfo : dict.lvWarn;
      return (
        <div className={`relative rounded-xl border p-4 shadow-card [overflow-wrap:anywhere] ${border} ${mod.excluded ? 'opacity-45' : ''}`}>
          <RemoveBtn title={dict.remove} onRemove={onRemove} />
          <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${text}`}>
            <span className={`h-2 w-2 rounded-full ${level === 'danger' ? 'bg-red-500' : level === 'warn' ? 'bg-orange-500' : 'bg-sky-500'}`} />
            {dict.risk}
            <span className="rounded-full bg-white/80 px-1.5 py-px text-[10px] font-semibold normal-case">{lvLabel}</span>
          </div>
          <p className={`mt-2 pr-6 text-sm leading-relaxed text-zinc-800 ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}>
            {mod.note}
          </p>
        </div>
      );
    }

    case 'checkpoint':
      return (
        <div className={`${base} border-emerald-200 p-4 ${mod.excluded ? 'opacity-45' : ''}`}>
          <RemoveBtn title={dict.remove} onRemove={onRemove} />
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <span className={`h-2 w-2 rounded-full ${DOT.checkpoint}`} />
            {dict.checkpoint}
          </div>
          <p className={`mt-2 pr-6 font-medium ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}>
            {mod.title}
          </p>
          {!mod.excluded && mod.criteria && mod.criteria.length > 0 && (
            <ul className="mt-2 space-y-1">
              {mod.criteria.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-600">
                  <span className="text-emerald-500">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      );

    case 'resource':
      return (
        <div
          className={`relative flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100/70 px-3 py-2 shadow-card ${mod.excluded ? 'opacity-45' : ''}`}
        >
          {dragHandle}
          <span className={`h-2 w-2 rounded-full ${DOT.resource}`} />
          <span className={`font-mono text-sm text-zinc-700 ${mod.excluded ? 'line-through' : ''}`}>{mod.label}</span>
          {mod.path && <span className="truncate font-mono text-xs text-zinc-400">{mod.path}</span>}
          <RemoveBtn title={dict.remove} onRemove={onRemove} />
        </div>
      );

    default:
      return (
        <div className={`${base} p-4 text-sm text-zinc-500`}>
          <span className="font-mono">{(mod as { type?: string }).type}</span> — unsupported module (preserved)
        </div>
      );
  }
}
