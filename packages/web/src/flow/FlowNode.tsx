import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { PlanModule } from '@flowdeck/core';
import { Dict } from '../i18n.js';
import { EditableText } from '../components/ModuleCard.js';

export type FDData = { mod: PlanModule; idx?: number };
export type FDNodeT = Node<FDData, 'fd'>;

/** phase palette — cycled per group marker */
export const PHASE_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#e11d48', '#0891b2'];

export interface FDCtxValue {
  dict: Dict;
  lang: 'zh' | 'en';
  onUpdate: (id: string, next: PlanModule) => void;
  onConvert: (id: string) => void;
  /** phase color per module (band + member accents) */
  colorOf: (mod: PlanModule) => string;
  /** chain order among steps (01, 02, …) */
  stepNo: (id: string) => number | null;
  focus: (id: string) => void;
}

export const FDContext = createContext<FDCtxValue>({
  dict: {} as Dict,
  lang: 'zh',
  onUpdate: () => {},
  onConvert: () => {},
  colorOf: () => '#2563eb',
  stepNo: () => null,
  focus: () => {},
});

export const GLYPH: Record<string, string> = {
  step: '✓',
  question: '?',
  suggestion: '★',
  risk: '!',
  checkpoint: '⚑',
  resource: '⬡',
  group: '◆',
};

const TYPE_TINT: Record<string, string> = {
  step: 'bg-blue-100 text-blue-600',
  question: 'bg-amber-100 text-amber-600',
  suggestion: 'bg-violet-100 text-violet-600',
  risk: 'bg-orange-100 text-orange-600',
  checkpoint: 'bg-emerald-100 text-emerald-600',
  resource: 'bg-zinc-100 text-zinc-500',
};

export function nodeColor(mod: PlanModule): string {
  return (
    { step: '#3b82f6', question: '#f59e0b', suggestion: '#a855f7', risk: '#f97316', checkpoint: '#10b981', resource: '#a1a1aa', group: '#18181b' }[
      mod.type
    ] ?? '#d4d4d8'
  );
}

function cardBorder(type: string): string {
  if (type === 'risk') return 'border-orange-200 bg-orange-50/50';
  if (type === 'question') return 'border-amber-200';
  if (type === 'suggestion') return 'border-violet-200';
  if (type === 'checkpoint') return 'border-emerald-200';
  return 'border-zinc-200';
}

export function FDNode({ id, data, selected, dragging }: NodeProps<FDNodeT>) {
  const { mod, idx } = data;
  const ctx = useContext(FDContext);
  const { dict, onUpdate, onConvert, colorOf, stepNo } = ctx;
  const color = colorOf(mod);
  const isStep = mod.type === 'step';
  const w = mod.type === 'group' ? 'w-[330px]' : 'w-[252px]';
  const enterDelay = { animationDelay: `${Math.min(idx ?? 0, 12) * 40}ms` };
  const dragSquash = dragging ? 'fd-dragging' : '';
  // long agent-written content clamps to a few lines; click the card text to expand
  const [expanded, setExpanded] = useState(false);
  const clamp = (lines: number) => (expanded ? '' : `line-clamp-${lines}`);
  const grow = { onClick: () => setExpanded((v) => !v) };
  // one-shot reward pop when a question gets answered on this card
  const [reward, setReward] = useState(false);
  const qAnswer = mod.type === 'question' ? mod.answer ?? null : null;
  const prevAnswer = useRef<string | null>(null);
  useEffect(() => {
    const answered = !prevAnswer.current && qAnswer;
    prevAnswer.current = qAnswer;
    if (!answered) return;
    setReward(true);
    const t = setTimeout(() => setReward(false), 550);
    return () => clearTimeout(t);
  }, [qAnswer]);

  const chainHandles = (
    <>
      <Handle
        id="in"
        type="target"
        position={Position.Top}
        title="接收上一步 / from previous step"
        className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400 hover:!bg-zinc-600"
      />
      <Handle
        id="out"
        type="source"
        position={Position.Bottom}
        title="拖到下一节点顶部 = 执行顺序 / drag to next node top = order"
        className="!h-3 !w-3 !border-2 !border-white !bg-zinc-500 hover:!bg-zinc-700"
      />
    </>
  );

  /* ---------- phase band ---------- */
  if (mod.type === 'group') {
    return (
      <div
        className={`${w} fd-band fd-card ${dragSquash} animate-node-in rounded-xl px-4 py-2.5 text-white shadow-lift ${selected ? 'ring-2 ring-blue-400' : ''}`}
        style={{ background: `linear-gradient(135deg, ${color}, ${color}b8)`, '--glow': `${color}66`, ...enterDelay } as React.CSSProperties}      >
        {chainHandles}
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/30 text-[10px] font-bold backdrop-blur-sm">
            {GLYPH.group}
          </span>
          <EditableText
            value={mod.title}
            onCommit={(title) => onUpdate(id, { ...mod, title })}
            className="nodrag text-[12px] font-semibold uppercase tracking-widest"
            placeholder={dict.titlePh}
          />
        </div>
        {mod.note && (
          <div className={`mt-0.5 text-3xs text-white/80 [overflow-wrap:anywhere] ${clamp(2)}`} {...grow}>
            {mod.note}
          </div>
        )}
      </div>
    );
  }

  /* ---------- regular cards ---------- */
  // the two resident animations: unanswered-question halo / danger-risk halo
  let halo = '';
  let haloColor: string | undefined;
  if (mod.type === 'question' && !mod.answer && !mod.excluded && !selected) {
    halo = 'fd-halo';
    haloColor = 'rgb(245 158 11 / 0.4)';
  }
  if (mod.type === 'risk' && mod.level === 'danger' && !mod.excluded && !selected) {
    halo = 'fd-halo';
    haloColor = 'rgb(239 68 68 / 0.4)';
  }

  const levelBadge =
    mod.type === 'risk' && !mod.excluded ? (
      <span
        className={`rounded-full px-1.5 text-3xs font-semibold uppercase leading-4 ${
          mod.level === 'danger'
            ? 'bg-red-100 text-red-600'
            : mod.level === 'info'
              ? 'bg-sky-100 text-sky-600'
              : 'bg-orange-100 text-orange-600'
        }`}
      >
        {mod.level === 'danger' ? dict.lvDanger : mod.level === 'info' ? dict.lvInfo : dict.lvWarn}
      </span>
    ) : null;

  const header = (
    <div className="flex items-center gap-1.5">
      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-md text-[10px] font-bold ${TYPE_TINT[mod.type] ?? 'bg-zinc-100 text-zinc-500'}`}>
        {GLYPH[mod.type] ?? '▪'}
      </span>
      <span className="text-3xs font-semibold uppercase tracking-wider text-zinc-400">
        {(dict as Record<string, string>)[mod.type] ?? mod.type}
      </span>
      {levelBadge}
    </div>
  );

  let body: React.ReactNode = null;

  switch (mod.type) {
    case 'step': {
      const no = stepNo(mod.id!);
      body = (
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
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              {no !== null && (
                <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
                  {String(no).padStart(2, '0')}
                </span>
              )}
              <EditableText
                value={mod.title}
                onCommit={(title) => onUpdate(id, { ...mod, title })}
                className={`nodrag text-[13px] font-medium leading-snug [overflow-wrap:anywhere] ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}
                placeholder={dict.titlePh}
              />
            </div>
            {mod.detail && (
              <p
                title={mod.detail}
                className={`mt-0.5 cursor-pointer text-2xs leading-snug text-zinc-500 nodrag [overflow-wrap:anywhere] ${clamp(3)}`}
                {...grow}
              >
                {mod.detail}
              </p>
            )}
          </div>
        </div>
      );
      break;
    }

    case 'question':
      body = (
        <>
          <p
            title={mod.question}
            className={`cursor-pointer text-xs font-medium leading-snug nodrag [overflow-wrap:anywhere] ${clamp(3)} ${mod.excluded ? 'line-through' : ''}`}
            {...grow}
          >
            {mod.question}
          </p>
          {!mod.excluded && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {mod.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onUpdate(id, { ...mod, answer: mod.answer === opt ? null : opt })}
                  className={`fd-chip nodrag flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs ${
                    mod.answer === opt
                      ? 'fd-chip-on chip-grad-amber border-amber-400/70 text-white'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-amber-300 hover:bg-amber-50'
                  }`}
                >
                  {mod.answer === opt && (
                    <svg viewBox="0 0 12 12" className="fd-check h-2.5 w-2.5">
                      <path d="M2 6.5 4.8 9 10 3.5" pathLength="1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
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
          <p
            title={mod.title}
            className={`cursor-pointer text-xs font-medium leading-snug nodrag [overflow-wrap:anywhere] ${clamp(2)} ${mod.adopted ? 'text-violet-700' : ''} ${mod.excluded ? 'line-through' : ''}`}
            {...grow}
          >
            {mod.title}
          </p>
          {mod.detail && (
            <p
              title={mod.detail}
              className={`mt-0.5 cursor-pointer text-2xs text-zinc-500 nodrag [overflow-wrap:anywhere] ${clamp(3)}`}
              {...grow}
            >
              {mod.detail}
            </p>
          )}
          {!mod.excluded && (
            <div className="mt-1.5 flex gap-1">
              <button
                onClick={() => onUpdate(id, { ...mod, adopted: !mod.adopted })}
                className={`fd-chip nodrag rounded-full px-2.5 py-1 text-2xs font-medium ${
                  mod.adopted ? 'fd-chip-on chip-grad-violet text-white' : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                }`}
              >
                {mod.adopted ? dict.adopted : dict.adopt}
              </button>
              {!mod.adopted && (
                <button
                  onClick={() => onConvert(id)}
                  className="nodrag rounded-full bg-zinc-100 px-2.5 py-1 text-2xs text-zinc-600 hover:bg-zinc-200"
                >
                  {dict.toStep}
                </button>
              )}
            </div>
          )}
        </>
      );
      break;

    case 'risk':
      body = (
        <p
          title={mod.note}
          className={`cursor-pointer text-2xs leading-snug text-zinc-800 nodrag [overflow-wrap:anywhere] ${clamp(4)} ${mod.excluded ? 'line-through' : ''}`}
          {...grow}
        >
          {mod.note}
        </p>
      );
      break;

    case 'checkpoint':
      body = (
        <>
          <p
            title={mod.title}
            className={`cursor-pointer text-xs font-medium leading-snug nodrag [overflow-wrap:anywhere] ${clamp(2)} ${mod.excluded ? 'line-through' : ''}`}
            {...grow}
          >
            {mod.title}
          </p>
          {!!mod.criteria?.length && (
            <ul className="mt-1 space-y-0.5">
              {mod.criteria.slice(0, 3).map((c, i) => (
                <li key={i} className="flex gap-1 text-3xs text-zinc-500">
                  <span className="text-emerald-500">✓</span>
                  {c}
                </li>
              ))}
              {mod.criteria.length > 3 && <li className="text-3xs text-zinc-400">+{mod.criteria.length - 3}</li>}
            </ul>
          )}
        </>
      );
      break;

    case 'resource':
      body = (
        <span
          title={mod.label}
          className={`cursor-pointer font-mono text-2xs text-zinc-700 nodrag [overflow-wrap:anywhere] ${clamp(2)} ${mod.excluded ? 'line-through' : ''}`}
          {...grow}
        >
          {mod.label}
        </span>
      );
      break;

    default:
      body = <span className="text-2xs text-zinc-400">{(mod as { type?: string }).type} (preserved)</span>;
  }

  const adopted = mod.type === 'suggestion' && mod.adopted;

  return (
    <div
      className={`${w} fd-card ${dragSquash} ${reward ? 'fd-reward' : ''} animate-node-in relative rounded-xl border bg-white shadow-card hover:shadow-lift ${cardBorder(mod.type)} ${selected ? 'ring-2 ring-blue-400 border-blue-200' : ''} ${halo} ${mod.excluded ? 'opacity-45' : ''}`}
      style={
        {
          borderLeft: `3px solid ${color}`,
          '--glow': nodeColor(mod),
          ...enterDelay,
          ...(haloColor ? { '--halo-color': haloColor } : {}),
        } as React.CSSProperties
      }
    >
      {chainHandles}
      {isStep && (
        <>
          <Handle
            id="dep-in"
            type="target"
            position={Position.Left}
            title="被依赖:从其他步骤右侧拖来 / receives dependency wire"
            className="!h-3.5 !w-3.5 !border-2 !border-white !bg-sky-400 hover:!bg-sky-500 hover:!scale-150 !transition-transform"
          />
          <Handle
            id="dep-out"
            type="source"
            position={Position.Right}
            title="拖到另一步骤左侧 = 此步是前置 / drag to another step's left"
            className="!h-3.5 !w-3.5 !border-2 !border-white !bg-sky-400 hover:!bg-sky-500 hover:!scale-150 !transition-transform"
          />
        </>
      )}
      <div className={`p-3 ${adopted ? 'rounded-xl bg-violet-50/70' : ''}`}>
        {header}
        <div className="mt-1.5">{body}</div>
      </div>
    </div>
  );
}
