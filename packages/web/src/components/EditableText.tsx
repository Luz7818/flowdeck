import { useEffect, useRef, useState } from 'react';

/** commit-on-blur editable text (span → contentEditable) */
export function EditableText({
  value,
  onCommit,
  className,
  placeholder,
  autoEdit = false,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
  /** start in edit mode (freshly added module — caret ready, no extra click) */
  autoEdit?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(autoEdit);

  useEffect(() => {
    if (!ref.current) return;
    if (editing) {
      // auto-edit (fresh module) mounts straight into editing — the span never
      // got a non-editing sync pass, so seed the initial value once
      if (!ref.current.textContent && value) ref.current.textContent = value;
      return;
    }
    if (ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  });

  // the browser decides focus on mousedown, before React flips contentEditable —
  // focus programmatically once editable so the first click lands with a caret.
  // A fresh xyflow node mounts visibility:hidden until measured, and focusing an
  // invisible element is dropped — retry until the element actually takes focus.
  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    const placeCaret = () => {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    };
    el.focus();
    placeCaret();
    if (document.activeElement === el) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      el.focus();
      placeCaret();
      if (document.activeElement === el || tries > 10) clearInterval(t);
    }, 120);
    return () => clearInterval(t);
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
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
      className={`${className ?? ''} outline-none rounded focus:bg-amber-50 focus:ring-2 focus:ring-amber-200 px-0.5 -mx-0.5 dark:focus:bg-amber-500/10 dark:focus:ring-amber-500/30 ${editing ? '' : value ? '' : 'text-zinc-400'}`}
    />
  );
}
