import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plan, PlanModule } from '@flowdeck/core';
import { CanvasClient, ConnState } from './ws.js';
import { detectLang, getDict, Lang, saveLang } from './i18n.js';
import { ModuleCard } from './components/ModuleCard.js';
import { SortableCard } from './components/SortableCard.js';
import { InsertCard } from './components/InsertCard.js';
import { HistoryPage } from './components/HistoryPage.js';
import { FlowView } from './flow/FlowView.js';

function getSessionId(): string | null {
  const m = location.pathname.match(/^\/s\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(location.search).get('id');
}

let uiSeq = 0;
function newId(type: string): string {
  uiSeq += 1;
  return `${type}_ui_${Date.now().toString(36)}_${uiSeq}`;
}

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const dict = getDict(lang);
  const [route, setRoute] = useState(location.hash);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<ConnState>('connecting');
  const [waiting, setWaiting] = useState(false);
  const [view, setView] = useState<'flow' | 'list'>('flow');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const clientRef = useRef<CanvasClient | null>(null);
  const flowCommitRef = useRef<(() => Plan) | null>(null);
  const sessionId = useRef(getSessionId()).current;

  const registerCommit = useCallback((fn: (() => Plan) | null) => {
    flowCommitRef.current = fn;
  }, []);

  /** leaving the flow view commits the graph back into plan state */
  const switchView = useCallback(
    (next: 'flow' | 'list') => {
      if (next === view) return;
      if (next === 'list' && flowCommitRef.current) {
        const p = flowCommitRef.current();
        if (p) setPlan(p);
      }
      setView(next);
    },
    [view],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // keep the document chrome in step with the UI language and loaded plan
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);
  useEffect(() => {
    document.title = plan?.title ? `${plan.title} · FlowDeck` : 'FlowDeck';
  }, [plan?.title]);

  useEffect(() => {
    if (route === '#/history') return;
    if (!sessionId) {
      setState('not-found');
      return;
    }
    // reuse one client across route changes so local edits survive history round-trips
    if (!clientRef.current) {
      clientRef.current = new CanvasClient({ onPlan: setPlan, onState: setState });
    }
    clientRef.current.connect(sessionId);
  }, [sessionId, route]);

  const updateModule = (index: number, next: PlanModule) =>
    setPlan((p) => (p ? { ...p, modules: p.modules.map((m, i) => (i === index ? next : m)) } : p));

  /** indexes that are visible (collapsed group hides members, header stays) */
  const visible = useMemo(() => {
    if (!plan) return [];
    const out: number[] = [];
    let hiding = false;
    plan.modules.forEach((m, i) => {
      if (m.type === 'group') {
        hiding = Boolean(m.collapsed);
        out.push(i);
        return;
      }
      if (!hiding) out.push(i);
    });
    return out;
  }, [plan]);

  const stepTitles = useMemo(() => {
    const map = new Map<string, string>();
    plan?.modules.forEach((m) => {
      if (m.type === 'step' && m.id) map.set(m.id, m.title);
    });
    return map;
  }, [plan]);

  const counts = useMemo(() => {
    if (!plan) return { steps: 0, open: 0 };
    let steps = 0;
    let open = 0;
    for (const m of plan.modules) {
      if (m.type === 'step' && !m.excluded) steps += 1;
      if (m.type === 'question' && !m.excluded && !m.answer) open += 1;
    }
    return { steps, open };
  }, [plan]);

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    setPlan((p) => {
      if (!p) return p;
      const from = p.modules.findIndex((m) => m.id === active.id);
      const to = p.modules.findIndex((m) => m.id === over.id);
      if (from < 0 || to < 0) return p;
      return { ...p, modules: arrayMove(p.modules, from, to) };
    });
  };

  const toggleLang = () =>
    setLang((l) => {
      const next = l === 'zh' ? 'en' : 'zh';
      saveLang(next);
      return next;
    });

  const onConfirm = () => {
    if (waiting) return;
    // flow view owns its own graph state — pull the linearized plan from it
    const base = view === 'flow' && flowCommitRef.current ? flowCommitRef.current() : plan;
    if (!base) return;
    setWaiting(true);
    // collapsed is pure UI state — don't leak it into the plan the agent receives
    const cleaned: Plan = {
      ...base,
      modules: base.modules.map((m) => (m.type === 'group' ? { ...m, collapsed: undefined } : m)),
    };
    clientRef.current?.confirm(cleaned);
  };
  const onCancel = () => {
    if (waiting) return;
    setConfirmCancel(true);
  };
  const doCancel = () => {
    setConfirmCancel(false);
    setWaiting(true);
    clientRef.current?.cancel();
  };

  /* cancel confirmation popover: Esc / click-outside dismisses */
  const cancelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmCancel) return;
    const onDown = (e: MouseEvent) => {
      if (cancelRef.current && !cancelRef.current.contains(e.target as globalThis.Node)) setConfirmCancel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmCancel(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmCancel]);

  const insertStep = (afterIndex: number, title: string, detail?: string) =>
    setPlan((p) => {
      if (!p) return p;
      const mod: PlanModule = { type: 'step', id: newId('step'), title, detail };
      const modules = [...p.modules];
      modules.splice(afterIndex + 1, 0, mod);
      return { ...p, modules };
    });

  const convertSuggestion = (index: number) =>
    setPlan((p) => {
      if (!p) return p;
      const mod = p.modules[index];
      if (mod.type !== 'suggestion') return p;
      const step: PlanModule = { type: 'step', id: newId('step'), title: mod.title, detail: mod.detail };
      return { ...p, modules: p.modules.map((m, i) => (i === index ? step : m)) };
    });

  /* ---------- routing ---------- */
  if (route === '#/history') {
    return <HistoryPage dict={dict} lang={lang} />;
  }

  /* ---------- terminal / error states ---------- */
  if (state === 'not-found') {
    return <Splash title={dict.notFound} tone="muted" />;
  }
  if (state === 'done') {
    return <Splash title={dict.doneTitle} body={dict.doneBody} tone="ok" />;
  }
  if (state === 'cancelled') {
    return <Splash title={dict.cancelledTitle} body={dict.cancelledBody} tone="muted" />;
  }

  const busy = state === 'connecting' || state === 'error';
  const anyCollapsed = plan?.modules.some((m) => m.type === 'group' && m.collapsed) ?? false;
  const dndEnabled = visible.length > 1 && !anyCollapsed;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <div className="grid grid-cols-2 gap-[3px] rounded-[10px] border border-zinc-200 bg-white p-1.5 shadow-card">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-blue-600" />
            <span className="h-2.5 w-2.5 rounded-[3px] bg-violet-500" />
            <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
            <span className="h-2.5 w-2.5 rounded-[3px] bg-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">
              {plan?.title ?? 'FlowDeck'}
            </div>
            <div className="text-2xs text-zinc-400">
              {dict.tagline}
              {plan && ` · ${counts.steps} ${dict.step}${lang === 'zh' ? '' : 's'}`}
              {plan && counts.open > 0 && ` · ${counts.open} ${dict.question}`}
            </div>
          </div>
          <div className="relative flex rounded-lg border border-zinc-200 bg-zinc-100/70 text-2xs font-medium">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1/2 rounded-lg bg-white shadow-sm transition-transform duration-200 ease-out-expo"
              style={{ transform: view === 'flow' ? 'translateX(0)' : 'translateX(100%)' }}
            />
            <button
              onClick={() => switchView('flow')}
              className={`relative z-10 w-[64px] rounded-lg py-1 text-center ${view === 'flow' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              {dict.flowView}
            </button>
            <button
              onClick={() => switchView('list')}
              className={`relative z-10 w-[64px] rounded-lg py-1 text-center ${view === 'list' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              {dict.listView}
            </button>
          </div>
          <button
            onClick={() => (location.hash = '#/history')}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            {dict.history}
          </button>
          <button
            onClick={toggleLang}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            {dict.lang}
          </button>
        </div>
      </header>

      {/* body */}
      {view === 'flow' && plan ? (
        <main key="flow" className="animate-fade-in relative flex-1 pb-14">
          <FlowView plan={plan} dict={dict} lang={lang} registerCommit={registerCommit} />
        </main>
      ) : (
        <main key="list" className="animate-fade-in mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-6">
          {busy && !plan && <Splash inline title={dict.connecting} />}
          {state === 'error' && plan && (
          <div className="mb-4 flex animate-slide-up items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            <span>{dict.disconnected}</span>
            <button
              onClick={() => sessionId && clientRef.current?.connect(sessionId)}
              className="shrink-0 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
            >
              {dict.retry}
            </button>
          </div>
        )}

        {plan && plan.modules.length === 0 && (
          <div className="animate-pop-in rounded-2xl border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-400">
            {dict.emptyPlan}
          </div>
        )}

        {plan && plan.modules.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={visible.map((i) => plan.modules[i].id!).filter(Boolean)}
              strategy={verticalListSortingStrategy}
              disabled={!dndEnabled}
            >
              <div className="space-y-1">
                {plan.modules.map((mod, i) => {
                  if (!visible.includes(i)) return null;
                  const isGroup = mod.type === 'group';
                  return (
                    <div
                      key={mod.id ?? i}
                      className="animate-slide-up space-y-1"
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    >
                      <SortableCard id={mod.id!} disabled={isGroup ? false : mod.excluded}>
                        {(handle) => (
                          <ModuleCard
                            mod={mod}
                            index={countStepBefore(plan.modules, i)}
                            stepTitles={stepTitles}
                            lang={lang}
                            dict={dict}
                            dragHandle={dndEnabled ? handle : null}
                            onChange={(next) => updateModule(i, next)}
                            onRemove={() => updateModule(i, { ...mod, excluded: true } as PlanModule)}
                            onConvert={mod.type === 'suggestion' ? () => convertSuggestion(i) : undefined}
                            toggleCollapsed={isGroup ? () => updateModule(i, { ...mod, collapsed: !mod.collapsed }) : undefined}
                          />
                        )}
                      </SortableCard>
                      {!isGroup && (
                        <InsertCard dict={dict} onInsert={(title, detail) => insertStep(i, title, detail)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
        </main>
      )}

      {/* footer actions */}
      {plan && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200/80 bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 px-5 py-3">
            <div className="relative" ref={cancelRef}>
              {confirmCancel && (
                <div className="absolute bottom-[calc(100%+10px)] right-0 w-60 animate-pop-in origin-bottom-right rounded-xl border border-zinc-200 bg-white p-3 shadow-overlay">
                  <p className="text-xs font-semibold text-zinc-800">{dict.confirmCancelTitle}</p>
                  <p className="mt-1 text-2xs leading-relaxed text-zinc-500">{dict.confirmCancelBody}</p>
                  <div className="mt-2.5 flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
                    >
                      {dict.confirmCancelNo}
                    </button>
                    <button
                      onClick={doCancel}
                      className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600"
                    >
                      {dict.confirmCancelYes}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={onCancel}
                disabled={waiting}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-40"
              >
                {dict.cancel}
              </button>
            </div>
            <button
              onClick={onConfirm}
              disabled={waiting}
              className="fd-cta rounded-lg px-5 py-2 text-sm font-medium text-white"
            >
              {counts.open > 0 ? `${dict.confirm} (${counts.open})` : dict.confirm}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function countStepBefore(modules: PlanModule[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i++) {
    if (modules[i].type === 'step') n += 1;
  }
  return n;
}

function Splash({
  title,
  body,
  tone = 'muted',
  inline = false,
}: {
  title: string;
  body?: string;
  tone?: 'ok' | 'muted';
  inline?: boolean;
}) {
  const inner = (
    <div className={`text-center ${inline ? 'py-10 text-sm text-zinc-400' : ''}`}>
      {!inline && (
        <div className="mb-4 flex animate-slide-up justify-center">
          {tone === 'ok' ? (
            <div className="flex h-12 w-12 animate-pop-in items-center justify-center rounded-2xl bg-emerald-500 shadow-lift shadow-emerald-500/30">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white">
                <path
                  d="M5 12.5 10 17 19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="24"
                  strokeDashoffset="24"
                  style={{ animation: 'check-draw 0.45s 0.15s var(--ease-out-expo) forwards' }}
                />
              </svg>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {['bg-zinc-300', 'bg-zinc-200', 'bg-zinc-200', 'bg-zinc-100'].map((c, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 animate-splash-pop rounded-md ${c}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <p className={`animate-slide-up font-medium ${inline ? 'text-zinc-400' : 'text-lg text-zinc-800'}`}>{title}</p>
      {body && (
        <p className="mt-2 animate-slide-up text-sm text-zinc-500 [animation-delay:80ms]">{body}</p>
      )}
    </div>
  );
  if (inline) return inner;
  return <div className="flex h-full items-center justify-center px-6">{inner}</div>;
}
