/**
 * Empty-state illustration: a miniature wireframe canvas — three cards, a
 * chain wire, a dependency dash, a selection box and a cursor. Shared by the
 * empty-plan guide and the empty history view so both speak the same language.
 */
export function CanvasArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 84" className={className ?? 'h-16 w-full'} aria-hidden>
      {/* selection marquee */}
      <rect x="6" y="6" width="108" height="72" rx="7" fill="none" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth="1.2" strokeDasharray="4 4" />
      <rect x="6" y="6" width="9" height="9" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
      <rect x="105" y="69" width="9" height="9" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
      {/* cards */}
      <rect x="20" y="16" width="38" height="21" rx="5.5" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.2" />
      <circle cx="27" cy="21.5" r="2.4" fill="#3b82f6" opacity=".75" />
      <rect x="34" y="19.5" width="19" height="3.2" rx="1.6" className="fill-blue-200 dark:fill-blue-500/40" />
      <rect x="72" y="16" width="38" height="21" rx="5.5" className="fill-amber-100 dark:fill-amber-500/20" stroke="#f59e0b" strokeWidth="1.2" />
      <circle cx="79" cy="21.5" r="2.4" fill="#f59e0b" opacity=".75" />
      <rect x="86" y="19.5" width="19" height="3.2" rx="1.6" className="fill-amber-200 dark:fill-amber-500/40" />
      <rect x="46" y="52" width="38" height="21" rx="5.5" className="fill-violet-100 dark:fill-violet-500/20" stroke="#a855f7" strokeWidth="1.2" />
      <circle cx="53" cy="57.5" r="2.4" fill="#a855f7" opacity=".75" />
      <rect x="60" y="55.5" width="19" height="3.2" rx="1.6" className="fill-violet-200 dark:fill-violet-500/40" />
      {/* chain wire + arrowhead */}
      <path d="M39 37v6h47v-3" fill="none" stroke="var(--fd-chain-stroke)" strokeWidth="1.5" />
      <path d="M83.2 44.5 86 41l1 4.6" fill="none" stroke="var(--fd-chain-stroke)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* dependency dash */}
      <path d="M58 26h14" fill="none" stroke="var(--fd-dep-stroke)" strokeWidth="1.3" strokeDasharray="4 3" />
      {/* cursor */}
      <path d="m116 56 7.6 17 2.4-7 7-2.4L116 56Z" className="fill-zinc-700 dark:fill-zinc-200" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}
