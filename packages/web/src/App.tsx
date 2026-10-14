import { useEffect, useMemo, useRef, useState } from 'react';
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
  const clientRef = useRef<CanvasClient | null>(null);
  const sessionId = useRef(getSessionId()).current;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
    if (!plan || waiting) return;
    setWaiting(true);
    clientRef.current?.confirm(plan);
  };
  const onCancel = () => {
    if (waiting) return;
    setWaiting(true);
    clientRef.current?.cancel();
  };

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
    return <HistoryPage dict={dict} />;
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
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <div className="grid grid-cols-2 gap-0.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-blue-600" />
            <span className="h-2.5 w-2.5 rounded-[3px] bg-violet-500" />
            <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
            <span className="h-2.5 w-2.5 rounded-[3px] bg-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">
              {plan?.title ?? 'FlowDeck'}
            </div>
            <div className="text-[11px] text-zinc-400">
              {dict.tagline}
              {plan && ` · ${counts.steps} ${dict.step}${lang === 'zh' ? '' : 's'}`}
              {plan && counts.open > 0 && ` · ${counts.open} ${dict.question}`}
            </div>
          </div>
          <button
            onClick={() => (location.hash = '#/history')}
            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
          >
            {dict.history}
          </button>
          <button
            onClick={toggleLang}
            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
          >
            {dict.lang}
          </button>
        </div>
      </header>

      {/* body */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-6">
        {busy && !plan && <Splash inline title={dict.connecting} />}
        {state === 'error' && plan && (
          <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-700">
            {dict.disconnected}
            <button
              onClick={() => sessionId && clientRef.current?.connect(sessionId)}
              className="ml-3 rounded-md bg-orange-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-600"
            >
              {dict.retry}
            </button>
          </div>
        )}

        {plan && (
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
                    <div key={mod.id ?? i} className="space-y-1">
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

      {/* footer actions */}
      {plan && (
        <footer className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 px-5 py-3">
            <button
              onClick={onCancel}
              disabled={waiting}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40"
            >
              {dict.cancel}
            </button>
            <button
              onClick={onConfirm}
              disabled={waiting}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-700 active:scale-[0.98] disabled:opacity-40"
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
        <div className="mb-3 flex justify-center">
          <div className="grid grid-cols-2 gap-1">
            <span className={`h-4 w-4 rounded-md ${tone === 'ok' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
            <span className={`h-4 w-4 rounded-md ${tone === 'ok' ? 'bg-emerald-400' : 'bg-zinc-200'}`} />
            <span className={`h-4 w-4 rounded-md ${tone === 'ok' ? 'bg-emerald-300' : 'bg-zinc-200'}`} />
            <span className={`h-4 w-4 rounded-md ${tone === 'ok' ? 'bg-emerald-200' : 'bg-zinc-100'}`} />
          </div>
        </div>
      )}
      <p className={`font-medium ${inline ? 'text-zinc-400' : 'text-lg text-zinc-800'}`}>{title}</p>
      {body && <p className="mt-2 text-sm text-zinc-500">{body}</p>}
    </div>
  );
  if (inline) return inner;
  return <div className="flex h-full items-center justify-center px-6">{inner}</div>;
}
