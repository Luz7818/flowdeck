import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Sortable wrapper: renders a drag handle and applies transform while dragging.
 * children is a function receiving the handle node, so each card decides
 * where the handle sits visually.
 */
export function SortableCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const handle = (
    <button
      {...attributes}
      {...listeners}
      aria-label="drag"
      className="mt-1 flex h-5 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-300 transition-colors hover:text-zinc-500 active:cursor-grabbing"
    >
      <svg viewBox="0 0 10 10" className="h-3.5 w-3.5" fill="currentColor">
        <circle cx="3" cy="1.8" r="1" />
        <circle cx="7" cy="1.8" r="1" />
        <circle cx="3" cy="5" r="1" />
        <circle cx="7" cy="5" r="1" />
        <circle cx="3" cy="8.2" r="1" />
        <circle cx="7" cy="8.2" r="1" />
      </svg>
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'relative z-20' : 'relative'}
    >
      {/* tilt/scale live on an inner wrapper: dnd-kit's inline transform on the
          outer element would otherwise override the class transform */}
      <div className={isDragging ? '-rotate-[1.2deg] scale-[1.01] opacity-80 drop-shadow-xl' : undefined}>
        {children(handle)}
      </div>
    </div>
  );
}
