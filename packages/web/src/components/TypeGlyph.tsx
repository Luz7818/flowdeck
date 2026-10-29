/**
 * 12×12 stroke icons per module type. Font glyphs (✓ ⚑ ⬡ …) render
 * differently on every OS — these stay identical everywhere. `currentColor`
 * keeps them on the badge/palette/legend color system.
 */
export function TypeGlyph({ type, className }: { type: string; className?: string }) {
  const cls = className ?? 'h-3 w-3';
  switch (type) {
    case 'step':
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'question':
      // speech bubble with an ellipsis — a question awaiting your answer
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <path d="M6 1.7c2.7 0 4.5 1.6 4.5 3.7S8.7 9.1 6 9.1c-.5 0-.9-.05-1.3-.15L2.3 10l.5-2.1C1.9 7.3 1.5 6.4 1.5 5.4 1.5 3.3 3.3 1.7 6 1.7Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="4" cy="5.4" r=".72" fill="currentColor" />
          <circle cx="6" cy="5.4" r=".72" fill="currentColor" />
          <circle cx="8" cy="5.4" r=".72" fill="currentColor" />
        </svg>
      );
    case 'suggestion':
      // lightbulb
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <path d="M6 1.3a3.3 3.3 0 0 1 1.9 6c-.4.3-.6.6-.6 1v.2H4.7v-.2c0-.4-.2-.7-.6-1a3.3 3.3 0 0 1 1.9-6Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M4.9 10.5h2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'risk':
      // warning triangle
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <path d="M6 1.5 11 10.2H1L6 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6 4.7v2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="6" cy="8.9" r=".72" fill="currentColor" />
        </svg>
      );
    case 'checkpoint':
      // pennant flag
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <path d="M3.2 1.4v9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M3.2 2h6.3L7.6 4.3l1.9 2.3H3.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case 'resource':
      // 3D box
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <path d="M6 1.3 10.5 3.5v5L6 10.7 1.5 8.5v-5L6 1.3Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M1.9 3.7 6 5.7l4.1-2M6 5.7v4.8" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      );
    case 'group':
      // diamond — phase lane marker
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <path d="M6 1.3 10.7 6 6 10.7 1.3 6 6 1.3Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    default:
      // unknown/future types preserved verbatim by the schema
      return (
        <svg viewBox="0 0 12 12" className={cls} aria-hidden>
          <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="6" cy="6" r="1.1" fill="currentColor" />
        </svg>
      );
  }
}
