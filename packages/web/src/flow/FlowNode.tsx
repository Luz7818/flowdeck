import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { PlanModule } from '@flowdeck/core';
import { Dict } from '../i18n.js';
import { EditableText } from '../components/EditableText.js';
import { TypeGlyph } from '../components/TypeGlyph.js';

export type FDData = { mod: PlanModule; idx?: number; fresh?: boolean; /** chain position for the confirmation wave */ wave?: number };
export type FDNodeT = Node<FDData, 'fd'>;

/** static map — Tailwind cannot generate dynamically interpolated utilities */
const CLAMP: Record<number, string> = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' };

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
  /** false after canvas rebuilds (undo/redo) — entrance motion is skipped */
  entrance: boolean;
}

export const FDContext = createContext<FDCtxValue>({
  dict: {} as Dict,
  lang: 'zh',
  onUpdate: () => {},
  onConvert: () => {},
  colorOf: () => '#2563eb',
  stepNo: () => null,
  focus: () => {},
  entrance: true,
});

const TYPE_TINT: Record<string, string> = {
  step: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  question: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  suggestion: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  risk: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
  checkpoint: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  resource: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

export function nodeColor(mod: PlanModule): string {
  return (
    { step: '#3b82f6', question: '#f59e0b', suggestion: '#a855f7', risk: '#f97316', checkpoint: '#10b981', resource: '#a1a1aa', group: '#18181b' }[
      mod.type
    ] ?? '#d4d4d8'
  );
}

function cardBorder(type: string): string {
  if (type === 'risk') return 'border-orange-200 bg-orange-50/50 dark:border-orange-500/30 dark:bg-orange-500/10';
  if (type === 'question') return 'border-amber-200 dark:border-amber-500/30';
  if (type === 'suggestion') return 'border-violet-200 dark:border-violet-500/30';
  if (type === 'checkpoint') return 'border-emerald-200 dark:border-emerald-500/30';
  return 'border-zinc-200 dark:border-zinc-800';
}

export function FDNode({ id, data, selected, dragging }: NodeProps<FDNodeT>) {
  const { mod, idx, wave } = data;
  const ctx = useContext(FDContext);
  const { dict, onUpdate, onConvert, colorOf, stepNo, entrance } = ctx;
  const color = colorOf(mod);
  const isStep = mod.type === 'step';
  const w = mod.type === 'group' ? 'w-[330px]' : 'w-[252px]';
  const enterDelay = entrance ? { animationDelay: `${(data.fresh ? 0 : Math.min(idx ?? 0, 12)) * 40}ms` } : undefined;
  const enter = entrance ? 'animate-node-in' : '';
  const dragSquash = dragging ? 'fd-dragging' : '';
  // long agent-written content clamps to a few lines; click the card text to expand
  const [expanded, setExpanded] = useState(false);
  const clamp = (lines: number) => (expanded ? '' : CLAMP[lines] ?? '');
  const grow = { onClick: () => setExpanded((v) => !v) };
  // one-shot reward pop when a question gets answered on this card
  const [reward, setReward] = useState(false);
  // custom answer entry on question cards (agent options don't always cover the user's case)
  const [addingOption, setAddingOption] = useState(false);
  const [optionDraft, setOptionDraft] = useState('');
  // long criteria lists hide behind a +N expander
  const [showAllCriteria, setShowAllCriteria] = useState(false);
  // inline criterion entry on checkpoint cards (manual-mode checkpoints start empty)
  const [addingCriterion, setAddingCriterion] = useState(false);
  const [criterionDraft, setCriterionDraft] = useState('');
  const commitCriterion = (mod: Extract<PlanModule, { type: 'checkpoint' }>) => {
    const v = criterionDraft.trim();
    if (v) {
      const criteria = [...(mod.criteria ?? []), v];
      const done = [...(mod.criteriaDone ?? [])];
      while (done.length < criteria.length - 1) done.push(false);
      done.push(false);
      onUpdate(id, { ...mod, criteria, criteriaDone: done });
      if (criteria.length > 3) setShowAllCriteria(true);
    }
    setAddingCriterion(false);
    setCriterionDraft('');
  };
  const commitOption = (mod: Extract<PlanModule, { type: 'question' }>) => {
    const v = optionDraft.trim();
    if (v && !mod.options.includes(v)) onUpdate(id, { ...mod, options: [...mod.options, v], answer: v });
    setAddingOption(false);
    setOptionDraft('');
  };
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

  // both chain handles accept drag start/end so wires can be drawn in any
  // direction (B.top → A.bottom still creates A → B)
  const chainHandles = (
    <>
      <Handle
        id="in"
        type="target"
        position={Position.Top}
        isConnectableStart
        title={dict.hIn}
        className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400 hover:!bg-zinc-600"
      />
      <Handle
        id="out"
        type="source"
        position={Position.Bottom}
        isConnectableEnd
        title={dict.hOut}
        className="!h-3 !w-3 !border-2 !border-white !bg-zinc-500 hover:!bg-zinc-700"
      />
    </>
  );

  /* ---------- phase container: tinted region hugging its members ---------- */
  if (mod.type === 'group') {
    return (
      <div
        className={`fd-band fd-card group h-full w-full rounded-2xl ${enter} ${selected ? 'ring-2 ring-blue-400' : ''}`}
        style={
          {
            background: `${color}0d`,
            border: `1px solid ${color}45`,
            '--glow': `${color}66`,
            ...enterDelay,
            ...(wave !== undefined ? { '--wave': wave } : {}),
          } as React.CSSProperties
        }
      >
        <Handle
          id="in"
          type="target"
          position={Position.Top}
          isConnectableStart
          style={{ left: '28%', top: 0 }}
          title={dict.hIn}
          className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400 hover:!bg-zinc-600"
        />
        <Handle
          id="out"
          type="source"
          position={Position.Top}
          isConnectableEnd
          style={{ left: '72%', top: 0 }}
          title={dict.hOut}
          className="!h-3 !w-3 !border-2 !border-white !bg-zinc-500 hover:!bg-zinc-700"
        />
        <div
          className="absolute left-4 top-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-white shadow-lift"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}b8)` }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/30 text-[10px] font-bold backdrop-blur-sm">
            <TypeGlyph type="group" className="h-2.5 w-2.5" />
          </span>
          <EditableText
            value={mod.title}
            onCommit={(title) => onUpdate(id, { ...mod, title })}
            autoEdit={Boolean(data.fresh)}
            className="nodrag whitespace-nowrap text-[12px] font-semibold uppercase tracking-widest"
            placeholder={dict.titlePh}
          />
          <button
            aria-label={mod.collapsed ? dict.expand : dict.collapse}
            title={mod.collapsed ? dict.expand : dict.collapse}
            onClick={() => onUpdate(id, { ...mod, collapsed: !mod.collapsed })}
            className="nodrag flex h-4 w-4 items-center justify-center rounded text-white/75 hover:bg-white/20 hover:text-white"
          >
            <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition-transform duration-200 ${mod.collapsed ? '-rotate-90' : ''}`}>
              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            aria-label={dict.excluded}
            onClick={() => onUpdate(id, { ...mod, excluded: true })}
            className="nodrag flex h-4 w-4 items-center justify-center rounded text-white/60 opacity-0 hover:bg-white/20 hover:text-white group-hover:opacity-100"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {mod.note && !mod.collapsed && <div className="absolute left-4 top-14 text-3xs text-zinc-500 dark:text-zinc-400">{mod.note}</div>}
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
      <button
        onClick={() =>
          onUpdate(id, { ...mod, level: mod.level === 'info' ? 'warn' : mod.level === 'warn' ? 'danger' : 'info' })
        }
        title={`${dict.cycleLevel}(${dict.lvInfo} → ${dict.lvWarn} → ${dict.lvDanger})`}
        aria-label={dict.cycleLevel}
        className={`nodrag rounded-full px-1.5 text-3xs font-semibold uppercase leading-4 transition-transform active:scale-90 ${
          mod.level === 'danger'
            ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300'
            : mod.level === 'info'
              ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
              : 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300'
        }`}
      >
        {mod.level === 'danger' ? dict.lvDanger : mod.level === 'info' ? dict.lvInfo : dict.lvWarn}
      </button>
    ) : null;

  const header = (
    <div className="flex items-center gap-1.5">
      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-md ${TYPE_TINT[mod.type] ?? 'bg-zinc-100 text-zinc-500'}`}>
        <TypeGlyph type={mod.type} className="h-2.5 w-2.5" />
      </span>
      <span className="text-3xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {(dict as Record<string, string>)[mod.type] ?? mod.type}
      </span>
      {levelBadge}
      {/* steps exclude via their checkbox; every other type gets a hover × */}
      {!isStep && !mod.excluded && (
        <button
          aria-label={dict.excluded}
          onClick={() => onUpdate(id, { ...mod, excluded: true })}
          className="nodrag ml-auto flex h-4 w-4 items-center justify-center rounded text-zinc-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-red-500/15"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
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
            aria-pressed={!mod.excluded}
            onClick={() => onUpdate(id, { ...mod, excluded: !mod.excluded })}
            className={`nodrag mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              mod.excluded ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800' : 'border-blue-500 bg-blue-500 text-white'
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
                autoEdit={Boolean(data.fresh)}
                className={`nodrag text-[13px] font-medium leading-snug [overflow-wrap:anywhere] ${mod.excluded ? 'line-through decoration-zinc-400' : ''}`}
                placeholder={dict.titlePh}
              />
            </div>
            {mod.detail && (
              <p
                title={mod.detail}
                className={`mt-0.5 cursor-pointer text-2xs leading-snug text-zinc-500 nodrag [overflow-wrap:anywhere] dark:text-zinc-400 ${clamp(3)}`}
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
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {mod.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onUpdate(id, { ...mod, answer: mod.answer === opt ? null : opt })}
                  aria-pressed={mod.answer === opt}
                  className={`fd-chip nodrag flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs ${
                    mod.answer === opt
                      ? 'fd-chip-on chip-grad-amber border-amber-400/70 text-white'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10'
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
              {addingOption ? (
                <input
                  autoFocus
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitOption(mod);
                    } else if (e.key === 'Escape') {
                      setAddingOption(false);
                      setOptionDraft('');
                    }
                  }}
                  onBlur={() => commitOption(mod)}
                  placeholder={dict.addOption}
                  aria-label={dict.addOption}
                  className="nodrag w-28 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-2xs text-zinc-700 outline-none placeholder:text-zinc-400 dark:border-amber-500/40 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder:text-zinc-500"
                />
              ) : (
                <button
                  onClick={() => setAddingOption(true)}
                  aria-label={dict.addOption}
                  title={dict.addOption}
                  className="nodrag flex items-center rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-2xs text-zinc-400 hover:border-amber-300 hover:text-amber-500 dark:border-zinc-600 dark:text-zinc-500 dark:hover:border-amber-500/40 dark:hover:text-amber-400"
                >
                  +
                </button>
              )}
            </div>
          )}
        </>
      );
      break;

    case 'suggestion':
      body = (
        <>
          <EditableText
            value={mod.title}
            onCommit={(title) => onUpdate(id, { ...mod, title })}
            autoEdit={Boolean(data.fresh)}
            className={`text-xs font-medium leading-snug nodrag [overflow-wrap:anywhere] ${mod.adopted ? 'text-violet-700' : ''} ${mod.excluded ? 'line-through' : ''}`}
            placeholder={dict.titlePh}
          />
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
                  mod.adopted ? 'fd-chip-on chip-grad-violet text-white' : 'bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25'
                }`}
              >
                {mod.adopted ? dict.adopted : dict.adopt}
              </button>
              {!mod.adopted && (
                <button
                  onClick={() => onConvert(id)}
                  className="nodrag rounded-full bg-zinc-100 px-2.5 py-1 text-2xs text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
          className={`cursor-pointer text-2xs leading-snug text-zinc-800 nodrag [overflow-wrap:anywhere] dark:text-zinc-200 ${clamp(4)} ${mod.excluded ? 'line-through' : ''}`}
          {...grow}
        >
          {mod.note}
        </p>
      );
      break;

    case 'checkpoint':
      body = (
        <>
          <EditableText
            value={mod.title}
            onCommit={(title) => onUpdate(id, { ...mod, title })}
            autoEdit={Boolean(data.fresh)}
            className={`cursor-pointer text-xs font-medium leading-snug nodrag [overflow-wrap:anywhere] ${mod.excluded ? 'line-through' : ''}`}
            placeholder={dict.titlePh}
          />
          {!!mod.criteria?.length && (
            <>
              {/* first three always visible; the rest unfold behind a grid-rows
                  transition (overview-panel trick — height glides, xyflow's
                  ResizeObserver follows, edges re-anchor smoothly) */}
              <ul className="mt-1 space-y-0.5">
                {mod.criteria.slice(0, 3).map((c, i) => {
                  const done = Boolean(mod.criteriaDone?.[i]);
                  return (
                    <li key={i}>
                      <button
                        onClick={() => {
                          const done2 = [...(mod.criteriaDone ?? [])];
                          while (done2.length < mod.criteria!.length) done2.push(false);
                          done2[i] = !done2[i];
                          onUpdate(id, { ...mod, criteriaDone: done2 });
                        }}
                        aria-pressed={done}
                        className={`nodrag flex w-full items-start gap-1 text-left text-3xs ${
                          done ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        <span className={done ? 'text-emerald-500' : 'text-zinc-300 dark:text-zinc-600'}>✓</span>
                        <span className="min-w-0 [overflow-wrap:anywhere]">{c}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {mod.criteria.length > 3 && (
                <div className={`grid transition-[grid-template-rows] duration-200 ease-out-expo ${showAllCriteria ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <ul className="space-y-0.5 pt-0.5">
                      {mod.criteria.slice(3).map((c, i) => {
                        const done = Boolean(mod.criteriaDone?.[i + 3]);
                        return (
                          <li key={i}>
                            <button
                              onClick={() => {
                                const done2 = [...(mod.criteriaDone ?? [])];
                                while (done2.length < mod.criteria!.length) done2.push(false);
                                done2[i + 3] = !done2[i + 3];
                                onUpdate(id, { ...mod, criteriaDone: done2 });
                              }}
                              aria-pressed={done}
                              className={`nodrag flex w-full items-start gap-1 text-left text-3xs ${
                                done ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              <span className={done ? 'text-emerald-500' : 'text-zinc-300 dark:text-zinc-600'}>✓</span>
                              <span className="min-w-0 [overflow-wrap:anywhere]">{c}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
              {mod.criteria.length > 3 && !showAllCriteria && (
                <button
                  onClick={() => setShowAllCriteria(true)}
                  className="text-3xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  +{mod.criteria.length - 3}
                </button>
              )}
            </>
          )}
          {!mod.excluded && (
            <div className="mt-1">
              {addingCriterion ? (
                <input
                  autoFocus
                  value={criterionDraft}
                  onChange={(e) => setCriterionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitCriterion(mod);
                    } else if (e.key === 'Escape') {
                      setAddingCriterion(false);
                      setCriterionDraft('');
                    }
                  }}
                  onBlur={() => commitCriterion(mod)}
                  placeholder={dict.addCriterion}
                  aria-label={dict.addCriterion}
                  className="nodrag w-full rounded-md border border-emerald-300 bg-white px-2 py-1 text-3xs text-zinc-700 outline-none placeholder:text-zinc-400 dark:border-emerald-500/40 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder:text-zinc-500"
                />
              ) : (
                <button
                  onClick={() => setAddingCriterion(true)}
                  className="nodrag rounded-md border border-dashed border-zinc-300 px-2 py-0.5 text-3xs text-zinc-400 hover:border-emerald-300 hover:text-emerald-500 dark:border-zinc-600 dark:text-zinc-500 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400"
                >
                  + {dict.addCriterion}
                </button>
              )}
            </div>
          )}
        </>
      );
      break;

    case 'resource':
      body = (
        <span className="flex min-w-0 items-center gap-1.5">
          {mod.kind && (
            <span
              className={`shrink-0 rounded px-1 text-3xs font-semibold uppercase leading-4 ${
                mod.kind === 'file'
                  ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'
                  : mod.kind === 'dir'
                    ? 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300'
                    : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
              }`}
            >
              {mod.kind}
            </span>
          )}
          <EditableText
            value={mod.label}
            onCommit={(label) => onUpdate(id, { ...mod, label })}
            autoEdit={Boolean(data.fresh)}
            className={`min-w-0 font-mono text-2xs text-zinc-700 nodrag [overflow-wrap:anywhere] dark:text-zinc-300 ${mod.excluded ? 'line-through' : ''}`}
            placeholder={dict.labelPh ?? dict.titlePh}
          />
        </span>
      );
      break;

    default:
      body = <span className="text-2xs text-zinc-400">{(mod as { type?: string }).type} (preserved)</span>;
  }

  const adopted = mod.type === 'suggestion' && mod.adopted;

  return (
    <div
      className={`${w} fd-card group ${enter} ${dragSquash} ${reward ? 'fd-reward' : ''} relative rounded-xl border bg-white shadow-card hover:shadow-lift dark:bg-zinc-900 ${cardBorder(mod.type)} ${selected ? 'ring-2 ring-blue-400 border-blue-200' : ''} ${halo} ${mod.excluded ? 'opacity-45' : ''}`}
      style={
        {
          borderLeft: `3px solid ${color}`,
          '--glow': nodeColor(mod),
          ...enterDelay,
          ...(haloColor ? { '--halo-color': haloColor } : {}),
          ...(wave !== undefined ? { '--wave': wave } : {}),
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
            title={dict.hDepIn}
            className="!h-3.5 !w-3.5 !border-2 !border-white !bg-sky-400 hover:!bg-sky-500 hover:!scale-150 !transition-transform"
          />
          <Handle
            id="dep-out"
            type="source"
            position={Position.Right}
            title={dict.hDepOut}
            className="!h-3.5 !w-3.5 !border-2 !border-white !bg-sky-400 hover:!bg-sky-500 hover:!scale-150 !transition-transform"
          />
        </>
      )}
      <div className={`p-3 ${adopted ? 'rounded-xl bg-violet-50/70 dark:bg-violet-500/10' : ''}`}>
        {header}
        <div className="mt-1.5">{body}</div>
        {mod.excluded && !isStep && (
          <button
            onClick={() => onUpdate(id, { ...mod, excluded: false })}
            className="nodrag mt-2 flex w-full items-center justify-center gap-1 rounded-full bg-zinc-100 py-0.5 text-3xs text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            ↺ {dict.restore}
          </button>
        )}
      </div>
    </div>
  );
}
