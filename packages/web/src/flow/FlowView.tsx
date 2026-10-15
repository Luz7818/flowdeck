import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStoreApi,
  useUpdateNodeInternals,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plan, PlanModule, chainFromOrder, defaultLayout, linearizePlan } from '@flowdeck/core';
import { FDNode, nodeColor, FDContext, PHASE_COLORS, type FDNodeT } from './FlowNode.js';
import { Dict } from '../i18n.js';

const CHAIN_STYLE = { stroke: '#52525b', strokeWidth: 1.6 };
const DEP_STYLE = { stroke: '#a1a1aa', strokeWidth: 1.2, strokeDasharray: '5 4' };
const ARROW = (color: string) => ({ type: MarkerType.ArrowClosed as const, color, width: 14, height: 14 });

function chainEdge(e: { source: string; target: string }): Edge {
  return {
    id: `chain-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'wire',
    style: CHAIN_STYLE,
    markerEnd: ARROW('#52525b'),
    reconnectable: true,
  };
}

function depEdge(source: string, target: string): Edge {
  return {
    id: `dep-${source}-${target}`,
    source,
    target,
    sourceHandle: 'dep-out',
    targetHandle: 'dep-in',
    type: 'wire',
    style: DEP_STYLE,
    markerEnd: ARROW('#a1a1aa'),
    reconnectable: true,
  };
}

/** selectable wire: click to select → drag endpoints to re-route, × / Delete to remove */
function WireEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, selected } = props;
  const { setEdges } = useReactFlow();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });
  const remove = () => setEdges((es) => es.filter((e) => e.id !== id));
  const baseWidth = (style?.strokeWidth as number) ?? 1.5;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={selected ? { ...style, strokeWidth: baseWidth + 0.8, stroke: '#2563eb' } : style}
        markerEnd={markerEnd}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            onClick={remove}
            aria-label="delete wire"
            className="nodrag nopan absolute flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-[11px] font-bold leading-none text-zinc-500 shadow-md transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function planToFlow(plan: Plan): { nodes: FDNodeT[]; edges: Edge[] } {
  const layout = defaultLayout(plan);
  const nodes: FDNodeT[] = plan.modules.map((m) => ({
    id: m.id!,
    type: 'fd',
    position: m.pos ?? layout[m.id!] ?? { x: 0, y: 0 },
    data: { mod: m } as never,
    deletable: false,
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = chainFromOrder(plan.modules)
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map(chainEdge);
  for (const m of plan.modules) {
    if (m.type !== 'step' || !m.dependsOn) continue;
    for (const d of m.dependsOn) {
      if (ids.has(d) && d !== m.id) edges.push(depEdge(d, m.id!));
    }
  }
  return { nodes, edges };
}

const DEFAULTS: Record<string, Partial<PlanModule>> = {
  step: { title: '新步骤 / new step' },
  question: { question: '需要确认什么?', options: ['是 / yes', '否 / no'] },
  suggestion: { title: '新建议 / new suggestion' },
  risk: { note: '风险描述 / risk note', level: 'warn' },
  checkpoint: { title: '新检查点 / new checkpoint', criteria: [] },
  resource: { label: '新资源 / resource' },
  group: { title: '新阶段 / new phase' },
};

const PALETTE_TYPES = ['step', 'question', 'suggestion', 'risk', 'checkpoint', 'resource', 'group'] as const;

let uiSeq = 0;
const newId = (t: string) => `${t}_ui_${Date.now().toString(36)}_${(uiSeq += 1)}`;

export interface FlowViewProps {
  plan: Plan;
  dict: Dict;
  /** App registers this to pull the linearized plan on confirm / view switch */
  registerCommit: (fn: (() => Plan) | null) => void;
}

function Inner({ plan, dict, registerCommit }: FlowViewProps) {
  const initial = useMemo(() => planToFlow(plan), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<FDNodeT>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const { fitView, setCenter } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(() => !localStorage.getItem('flowdeck.tips.seen'));
  const [legendOpen, setLegendOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const planRef = useRef(plan);
  planRef.current = plan;

  const updateMod = useCallback(
    (id: string, next: PlanModule) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, mod: next } } : n))),
    [setNodes],
  );

  const convertSuggestion = useCallback(
    (id: string) =>
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n;
          const mod = n.data.mod;
          if (mod.type !== 'suggestion') return n;
          return { ...n, data: { ...n.data, mod: { ...mod, type: 'step' } } };
        }),
      ),
    [setNodes],
  );

  /** wire the node data into nodes state before serializing */
  const getPlan = useCallback((): Plan => {
    const mods = nodes.map((n) => n.data.mod);
    const base: Plan = { ...planRef.current, modules: mods };
    const chain = edges
      .filter((e) => e.sourceHandle === 'out' && e.targetHandle === 'in')
      .map((e) => ({ source: e.source, target: e.target }));
    const positions = Object.fromEntries(nodes.map((n) => [n.id, n.position]));
    return linearizePlan(base, chain, positions);
  }, [nodes, edges]);

  const commitRef = useRef(getPlan);
  commitRef.current = getPlan;
  useEffect(() => {
    registerCommit(() => commitRef.current());
    return () => registerCommit(null);
  }, [registerCommit]);

  /**
   * Some embedded webviews ship a dead ResizeObserver — and occluded/minimized
   * windows stop producing rendering frames entirely, so neither RO nor rAF
   * ever fires. xyflow then never measures nodes (visibility:hidden, no edges).
   * Poll a few times: if edges are missing while nodes exist, measure manually —
   * DOM queries + the store's updateNodeInternals action, no frames required.
   */
  const storeApi = useStoreApi();
  const nodeIdsRef = useRef<string[]>([]);
  nodeIdsRef.current = nodes.map((n) => n.id!);
  const [measurementFixed, setMeasurementFixed] = useState(false);
  useEffect(() => {
    if (measurementFixed) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (document.querySelectorAll('.react-flow__edge').length > 0 || tries > 8) {
        clearInterval(t);
        setMeasurementFixed(true);
        return;
      }
      const { domNode, updateNodeInternals: applyInternals } = storeApi.getState();
      if (!domNode) return;
      const updates = new Map<string, { id: string; nodeElement: HTMLDivElement; force: boolean }>();
      nodeIdsRef.current.forEach((id) => {
        const el = domNode.querySelector<HTMLDivElement>(`.react-flow__node[data-id="${id}"]`);
        if (el) updates.set(id, { id, nodeElement: el, force: true });
      });
      if (updates.size) applyInternals(updates, { triggerFitView: false });
    }, 700);
    return () => clearInterval(t);
  }, [measurementFixed, storeApi]);

  /**
   * Handle-level strictness only when both handles are known; when hovering a
   * node body mid-drag (targetHandle undefined), accept by node type and let
   * connectionRadius snap the drop to the nearest valid handle.
   */
  const isValidConnection = useCallback(
    (c: Edge | Connection) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      const srcMod = nodes.find((n) => n.id === c.source)?.data.mod;
      const tgtMod = nodes.find((n) => n.id === c.target)?.data.mod;
      const srcDep = (c.sourceHandle ?? '').startsWith('dep');
      const tgtDep = (c.targetHandle ?? '').startsWith('dep');
      if (srcDep || tgtDep) {
        if (srcMod?.type !== 'step' || tgtMod?.type !== 'step') return false;
        return c.sourceHandle && c.targetHandle ? srcDep && tgtDep : true;
      }
      if (c.sourceHandle && c.targetHandle) return !srcDep && !tgtDep;
      return true;
    },
    [nodes],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      if ((c.sourceHandle ?? '').startsWith('dep')) {
        const src = nodes.find((n) => n.id === c.source)?.data.mod;
        if (src?.type !== 'step') return;
        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== c.target) return n;
            const mod = n.data.mod as PlanModule & { dependsOn?: string[] };
            if (mod.type !== 'step') return n;
            const deps = new Set(mod.dependsOn ?? []);
            deps.add(c.source!);
            return { ...n, data: { ...n.data, mod: { ...mod, dependsOn: [...deps] } } };
          }),
        );
        setEdges((es) => [...es.filter((e) => !(e.id === `dep-${c.source}-${c.target}`)), depEdge(c.source, c.target)]);
        return;
      }
      setEdges((es) => [
        ...es.filter((e) => !(e.sourceHandle === 'out' && (e.source === c.source || e.target === c.target))),
        chainEdge({ source: c.source, target: c.target }),
      ]);
    },
    [nodes, setEdges, setNodes],
  );

  /** drag an existing wire's endpoint to re-route it (chain → chain, dep → dep) */
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      if (!newConn.source || !newConn.target || newConn.source === newConn.target) return;
      if ((oldEdge.sourceHandle ?? '').startsWith('dep')) {
        // dependency rewiring: update dependsOn maps on both ends
        const { source: oldSrc, target: oldTgt } = oldEdge;
        setNodes((ns) =>
          ns.map((n) => {
            const mod = n.data.mod as PlanModule & { dependsOn?: string[] };
            if (mod.type !== 'step') return n;
            if (n.id === oldTgt) {
              const deps = (mod.dependsOn ?? []).filter((d) => d !== oldSrc);
              return { ...n, data: { ...n.data, mod: { ...mod, dependsOn: deps.length ? deps : undefined } } };
            }
            if (n.id === newConn.target) {
              const deps = new Set(mod.dependsOn ?? []);
              deps.add(newConn.source!);
              return { ...n, data: { ...n.data, mod: { ...mod, dependsOn: [...deps] } } };
            }
            return n;
          }),
        );
        setEdges((es) => es.filter((e) => e.id !== oldEdge.id).concat(depEdge(newConn.source, newConn.target)));
        return;
      }
      setEdges((es) => es.filter((e) => e.id !== oldEdge.id).concat(chainEdge({ source: newConn.source, target: newConn.target })));
    },
    [setEdges, setNodes],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const depRemoved = deleted.filter((e) => (e.sourceHandle ?? '').startsWith('dep'));
      if (!depRemoved.length) return;
      const keys = new Set(depRemoved.map((e) => `${e.source}->${e.target}`));
      setNodes((ns) =>
        ns.map((n) => {
          const mod = n.data.mod;
          if (mod.type !== 'step' || !mod.dependsOn?.length) return n;
          const deps = mod.dependsOn.filter((d) => !keys.has(`${d}->${n.id}`));
          return { ...n, data: { ...n.data, mod: { ...mod, dependsOn: deps.length ? deps : undefined } } };
        }),
      );
    },
    [setNodes],
  );

  const addModule = useCallback(
    (type: string) => {
      setPaletteOpen(false);
      const mod = { type, id: newId(type), ...(DEFAULTS[type] ?? {}) } as PlanModule;
      setNodes((ns) => {
        const outs = new Set(
          ns.filter((n) => edges.some((e) => e.source === n.id && e.sourceHandle === 'out')).map((n) => n.id),
        );
        const tail = [...ns].reverse().find((n) => !outs.has(n.id)) ?? ns[ns.length - 1];
        const pos = tail ? { x: tail.position.x, y: tail.position.y + 150 } : { x: 60, y: 60 };
        const next = [...ns, { id: mod.id!, type: 'fd' as const, position: pos, data: { mod } as never, deletable: false }];
        if (tail) setEdges((es) => [...es, chainEdge({ source: tail.id, target: mod.id! })]);
        return next;
      });
    },
    [edges, setEdges, setNodes],
  );

  const tidy = useCallback(() => {
    const p = getPlan();
    const layout = defaultLayout(p);
    setNodes((ns) => ns.map((n) => ({ ...n, position: layout[n.id] ?? n.position })));
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
  }, [getPlan, setNodes, fitView]);

  /* ---------- derived: phase colors + step numbering + stats + overview lists ---------- */
  const { colorMap, orderMap, stats, openQuestions, risks, suggestions } = useMemo(() => {
    const mods = nodes.map((n) => n.data.mod);
    const chain = edges
      .filter((e) => e.sourceHandle === 'out' && e.targetHandle === 'in')
      .map((e) => ({ source: e.source, target: e.target }));
    const ordered = linearizePlan({ ...planRef.current, modules: mods }, chain).modules;

    const colorMap = new Map<string, string>();
    const orderMap = new Map<string, number>();
    let gi = -1;
    let no = 0;
    for (const m of ordered) {
      if (!m.id) continue;
      if (m.type === 'group') gi += 1;
      const color = PHASE_COLORS[(gi < 0 ? 0 : gi) % PHASE_COLORS.length];
      colorMap.set(m.id, color);
      if (m.type === 'step' && !m.excluded) {
        no += 1;
        orderMap.set(m.id, no);
      }
    }

    const live = (f: (m: PlanModule) => boolean) => nodes.filter((n) => !n.data.mod.excluded && f(n.data.mod));
    const oq = live((m) => m.type === 'question' && !m.answer);
    const rk = live((m) => m.type === 'risk');
    const sg = live((m) => m.type === 'suggestion');
    const questionsAll = live((m) => m.type === 'question');
    const deps = nodes.reduce((acc, n) => acc + ((n.data.mod as { dependsOn?: string[] }).dependsOn?.length ?? 0), 0);

    return {
      colorMap,
      orderMap,
      stats: {
        steps: live((m) => m.type === 'step').length,
        phases: live((m) => m.type === 'group').length,
        open: oq.length,
        questionsAll: questionsAll.length,
        answered: questionsAll.length - oq.length,
        risks: rk.length,
        deps,
      },
      openQuestions: oq.map((n) => ({ id: n.id, mod: n.data.mod })),
      risks: rk.map((n) => ({ id: n.id, mod: n.data.mod })),
      suggestions: sg.map((n) => ({ id: n.id, mod: n.data.mod })),
    };
  }, [nodes, edges]);

  const colorOf = useCallback((m: PlanModule) => colorMap.get(m.id!) ?? PHASE_COLORS[0], [colorMap]);
  const stepNo = useCallback((id: string) => orderMap.get(id) ?? null, [orderMap]);

  const focus = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      setCenter(n.position.x + 126, n.position.y + 60, { zoom: 0.95, duration: 500 });
    },
    [nodes, setCenter],
  );


  const closeTips = () => {
    setTipsOpen(false);
    localStorage.setItem('flowdeck.tips.seen', '1');
  };

  const nodeTypes = useMemo(() => ({ fd: FDNode }), []);
  const edgeTypes = useMemo(() => ({ wire: WireEdge }), []);
  const ctxValue = useMemo(
    () => ({ dict, lang: 'zh' as const, onUpdate: updateMod, onConvert: convertSuggestion, colorOf, stepNo, focus }),
    [dict, updateMod, convertSuggestion, colorOf, stepNo, focus],
  );

  const progressPct = stats.questionsAll > 0 ? Math.round((stats.answered / stats.questionsAll) * 100) : 100;

  return (
    <FDContext.Provider value={ctxValue}>
      <div className="relative h-full w-full bg-gradient-to-br from-zinc-50 via-sky-50/50 to-violet-50/40">
        {/* toolbar */}
        <div className="absolute left-3 top-3 z-10 flex gap-2">
          <div className="relative">
            <button
              onClick={() => setPaletteOpen((v) => !v)}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-md hover:bg-zinc-700"
            >
              + {dict.addModule}
            </button>
            {paletteOpen && (
              <div className="absolute left-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                {PALETTE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => addModule(t)}
                    className="block w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                  >
                    {(dict as Record<string, string>)[`p${t[0].toUpperCase()}${t.slice(1)}`] ?? t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={tidy}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:bg-zinc-100"
          >
            {dict.tidy}
          </button>
          <button
            onClick={() => setTipsOpen(true)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:bg-zinc-100"
          >
            {dict.help}
          </button>
        </div>

        {/* stats strip */}
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white/90 px-4 py-2 shadow-md backdrop-blur">
            <Stat value={stats.steps} label={dict.step} color="#3b82f6" />
            <Stat value={stats.phases} label={dict.statsPhase} color="#7c3aed" />
            <Stat value={stats.open} label={dict.question} color="#f59e0b" alert={stats.open > 0} />
            <Stat value={stats.risks} label={dict.risk} color="#f97316" alert={stats.risks > 0} />
            <Stat value={stats.deps} label={dict.statsDeps} color="#0891b2" />
            <div className="w-24">
              <div className="mb-1 text-right text-[10px] font-medium text-zinc-400">{progressPct}%</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* overview panel */}
        <div className="absolute right-3 top-14 z-10 w-64">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-lg backdrop-blur">
            <button
              onClick={() => setOverviewOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              {dict.overview}
              <span className={`text-zinc-400 transition-transform ${overviewOpen ? '' : '-rotate-90'}`}>⌄</span>
            </button>
            {overviewOpen && (
              <div className="max-h-[46vh] space-y-3 overflow-y-auto px-3 pb-3">
                {stats.open + stats.risks + suggestions.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-zinc-400">{dict.overviewEmpty}</p>
                )}
                {openQuestions.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500">{dict.question}</p>
                    {openQuestions.map(({ id, mod }) => (
                      <button
                        key={id}
                        onClick={() => focus(id)}
                        className="mb-1 block w-full rounded-lg border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-left text-[11px] text-zinc-700 hover:border-amber-300"
                      >
                        {(mod as { question: string }).question}
                      </button>
                    ))}
                  </section>
                )}
                {risks.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-orange-500">{dict.risk}</p>
                    {risks.map(({ id, mod }) => (
                      <button
                        key={id}
                        onClick={() => focus(id)}
                        className="mb-1 block w-full rounded-lg border border-orange-100 bg-orange-50/60 px-2 py-1.5 text-left text-[11px] text-zinc-700 hover:border-orange-300"
                      >
                        {(mod as { note: string }).note}
                      </button>
                    ))}
                  </section>
                )}
                {suggestions.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">{dict.suggestion}</p>
                    {suggestions.map(({ id, mod }) => {
                      const s = mod as { title: string };
                      return (
                        <div
                          key={id}
                          className="mb-1 flex items-center gap-1 rounded-lg border border-violet-100 bg-violet-50/60 px-2 py-1.5"
                        >
                          <button
                            onClick={() => focus(id)}
                            className="min-w-0 flex-1 truncate text-left text-[11px] text-zinc-700 hover:text-violet-600"
                          >
                            {s.title}
                          </button>
                          <button
                            onClick={() => updateMod(id, { ...(mod as PlanModule), adopted: true } as PlanModule)}
                            className="shrink-0 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-400"
                          >
                            {dict.adopt}
                          </button>
                        </div>
                      );
                    })}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>

        {/* legend */}
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
          {legendOpen ? (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white/90 px-3 py-1.5 shadow-md backdrop-blur">
              {(['step', 'question', 'suggestion', 'risk', 'checkpoint', 'resource'] as const).map((t) => (
                <span key={t} className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className="h-2 w-2 rounded-sm" style={{ background: nodeColor({ type: t } as PlanModule) }} />
                  {(dict as Record<string, string>)[t] ?? t}
                </span>
              ))}
              <span className="mx-1 h-4 w-px bg-zinc-200" />
              <svg width="30" height="8">
                <line x1="0" y1="4" x2="30" y2="4" stroke="#52525b" strokeWidth="1.6" />
              </svg>
              <span className="text-[10px] text-zinc-500">{dict.flowView}</span>
              <svg width="30" height="8">
                <line x1="0" y1="4" x2="30" y2="4" stroke="#a1a1aa" strokeWidth="1.4" strokeDasharray="5 4" />
              </svg>
              <span className="text-[10px] text-zinc-500">{dict.dependsOn}</span>
              <button onClick={() => setLegendOpen(false)} className="ml-1 text-zinc-300 hover:text-zinc-500">
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setLegendOpen(true)}
              className="rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-[10px] text-zinc-500 shadow-sm hover:bg-zinc-100"
            >
              {dict.legend}
            </button>
          )}
        </div>

        {/* tips popover */}
        {tipsOpen && (
          <div className="absolute left-1/2 top-1/2 z-30 w-[340px] -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
              <p className="mb-3 text-sm font-semibold text-zinc-800">💡 {dict.tipsTitle}</p>
              <ul className="space-y-2">
                {[dict.tip1, dict.tip2, dict.tip3, dict.tip4, dict.tip5].map((t, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-zinc-600">
                    <span className="flex h-[18px] w-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-right">
                <button
                  onClick={closeTips}
                  className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                >
                  {dict.gotIt}
                </button>
              </div>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onReconnect={onReconnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          edgesReconnectable
          connectionRadius={40}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.6} color="#d9dee8" />
          <Controls showInteractive={false} className="!bottom-14 !left-3" />
          <MiniMap pannable zoomable nodeColor={(n) => nodeColor((n as FDNodeT).data.mod)} className="!bottom-3 !right-3" />
        </ReactFlow>
      </div>
    </FDContext.Provider>
  );
}

function Stat({ value, label, color, alert }: { value: number; label: string; color: string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-sm font-bold tabular-nums ${alert ? 'animate-pulse' : ''}`} style={{ color }}>
        {value}
      </span>
      <span className="text-[10px] text-zinc-400">{label}</span>
    </div>
  );
}

export function FlowView(props: FlowViewProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
