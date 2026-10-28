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
