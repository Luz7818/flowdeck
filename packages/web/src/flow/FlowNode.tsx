import { createContext, useContext } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { PlanModule } from '@flowdeck/core';
import { Dict } from '../i18n.js';
import { EditableText } from '../components/ModuleCard.js';

export type FDData = { mod: PlanModule };
export type FDNodeT = Node<FDData, 'fd'>;

/** shared canvas services (dict + edit callbacks) — provided above <ReactFlow> */
export const FDContext = createContext<{
  dict: Dict;
  lang: 'zh' | 'en';
  onUpdate: (id: string, next: PlanModule) => void;
  onConvert: (id: string) => void;
}>({ dict: {} as Dict, lang: 'zh', onUpdate: () => {}, onConvert: () => {} });

const DOT: Record<string, string> = {
  step: 'bg-blue-500',
  question: 'bg-amber-500',
  suggestion: 'bg-violet-500',
  risk: 'bg-orange-500',
  checkpoint: 'bg-emerald-500',
  resource: 'bg-zinc-400',
};

const LABEL = (mod: PlanModule, dict: Dict): string =>
  mod.type === 'group' ? '阶段' : (dict as Record<string, string>)[mod.type] ?? mod.type;

/**
 * Compact flow-canvas node for all module types.
 * Handles: top/bottom = execution chain; left/right (steps only) = dependency wires.
 */
export function FDNode({ id, data, selected }: NodeProps<FDNodeT>) {
  const { mod } = data;
  const ctx = useContext(FDContext);
  const { dict, onUpdate, onConvert } = ctx;
  const isStep = mod.type === 'step';
  const w = mod.type === 'group' ? 'w-[300px]' : 'w-[240px]';

  const chainHandles = (
    <>
      <Handle id="in" type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-0 !bg-zinc-400" />
      <Handle id="out" type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-0 !bg-zinc-400" />
    </>
  );

  let body: React.ReactNode = null;
  let header = (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[mod.type] ?? 'bg-zinc-300'}`} />
      {LABEL(mod, dict)}
    </div>
  );
  const cardBase = `rounded-xl border bg-white shadow-sm ${selected ? 'ring-2 ring-blue-400 border-blue-200' : 'border-zinc-200'}`;

  switch (mod.type) {
    case 'group':
      return (
        <div className={`${w} rounded-lg bg-zinc-800 px-3 py-2 text-white shadow-md ${selected ? 'ring-2 ring-blue-400' : ''}`}>
          {chainHandles}
          <div className="text-[11px] font-semibold uppercase tracking-widest">{mod.title}</div>
          {mod.note && <div className="text-[10px] text-zinc-300">{mod.note}</div>}
        </div>
      );

    case 'step':
      body = (
        <>
          <div className="flex items-start gap-1.5">
            <button
              aria-label={mod.excluded ? dict.keep : dict.excluded}
              onClick={() => onUpdate(id, { ...mod, excluded: !mod.excluded })}
              className={`nodrag mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                mod.excluded ? 'border-zinc-300 bg-zinc-100' : 'border-blue-500 bg-blue-500 text-white'
              }`}
            >
              {!mod.excluded && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                  <path d="M2 6.5 4.8 9 10 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <EditableText
              value={mod.title}
              onCommit={(title) => onUpdate(id, { ...mod, title })}
              className={`nodrag text-xs font-medium leading-snug ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}
              placeholder={dict.titlePh}
            />
          </div>
          {mod.detail && <p className="mt-1 text-[11px] leading-snug text-zinc-500">{mod.detail}</p>}
        </>
      );
      break;

    case 'question':
      body = (
        <>
          <p className={`text-xs font-medium leading-snug ${mod.excluded ? 'line-through' : ''}`}>{mod.question}</p>
          {!mod.excluded && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {mod.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onUpdate(id, { ...mod, answer: mod.answer === opt ? null : opt })}
                  className={`nodrag rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                    mod.answer === opt
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-amber-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </>
      );
      break;

    case 'suggestion':
      body = (
        <>
          <p className={`text-xs font-medium leading-snug ${mod.excluded ? 'line-through' : ''}`}>{mod.title}</p>
          {!mod.excluded && (
            <div className="mt-1.5 flex gap-1">
              <button
                onClick={() => onUpdate(id, { ...mod, adopted: !mod.adopted })}
                className={`nodrag rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  mod.adopted ? 'bg-violet-500 text-white' : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                }`}
              >
                {mod.adopted ? dict.adopted : dict.adopt}
              </button>
              {!mod.adopted && (
                <button
                  onClick={() => onConvert(id)}
                  className="nodrag rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-200"
                >
                  {dict.toStep}
                </button>
              )}
            </div>
          )}
        </>
      );
      break;

    case 'risk': {
      const level = mod.level ?? 'warn';
      const bg = level === 'danger' ? 'bg-red-50 border-red-200' : level === 'warn' ? 'bg-orange-50 border-orange-200' : 'bg-sky-50 border-sky-200';
      body = (
        <p className={`text-[11px] leading-snug text-zinc-800 ${mod.excluded ? 'line-through' : ''}`}>{mod.note}</p>
      );
      return (
        <div className={`${w} ${cardBase} ${bg} p-2.5 ${mod.excluded ? 'opacity-45' : ''}`}>
          {chainHandles}
          {header}
          <div className="mt-1">{body}</div>
        </div>
      );
    }

    case 'checkpoint':
      body = (
        <>
          <p className={`text-xs font-medium leading-snug ${mod.excluded ? 'line-through' : ''}`}>{mod.title}</p>
          {!!mod.criteria?.length && (
            <p className="mt-1 text-[10px] text-zinc-500">
              ✓ {mod.criteria.length} {dict.criteria}
            </p>
          )}
        </>
      );
      break;

    case 'resource':
      body = (
        <span className={`font-mono text-[11px] text-zinc-700 ${mod.excluded ? 'line-through' : ''}`}>{mod.label}</span>
      );
      break;

    default:
      body = <span className="text-[11px] text-zinc-400">{(mod as { type?: string }).type} (preserved)</span>;
  }

  return (
    <div className={`${w} ${cardBase} p-2.5 ${mod.excluded ? 'opacity-45' : ''}`}>
      {chainHandles}
      {isStep && (
        <>
          <Handle id="dep-in" type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-zinc-300" />
          <Handle id="dep-out" type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-zinc-300" />
        </>
      )}
      {header}
      <div className="mt-1">{body}</div>
    </div>
  );
}

export const nodeColor = (mod: PlanModule): string =>
  ({ step: '#3b82f6', question: '#f59e0b', suggestion: '#a855f7', risk: '#f97316', checkpoint: '#10b981', resource: '#a1a1aa', group: '#18181b' })[mod.type] ?? '#d4d4d8';
