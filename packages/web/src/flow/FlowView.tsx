import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plan, PlanModule, chainFromOrder, defaultLayout, linearizePlan } from '@flowdeck/core';
import { FDNode, nodeColor, FDContext } from './FlowNode.js';
import { Dict } from '../i18n.js';

type FDNodeT = Node<{ mod: PlanModule }, 'fd'>;

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
    type: 'smoothstep',
    style: CHAIN_STYLE,
    markerEnd: ARROW('#52525b'),
  };
}

function depEdge(source: string, target: string): Edge {
  return {
    id: `dep-${source}-${target}`,
    source,
    target,
    sourceHandle: 'dep-out',
    targetHandle: 'dep-in',
    type: 'smoothstep',
    style: DEP_STYLE,
    markerEnd: ARROW('#a1a1aa'),
  };
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
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  const isValidConnection = useCallback((c: Edge | Connection) => {
    if (!c.source || !c.target || c.source === c.target) return false;
    const depSide = (h: string | null | undefined) => (h ?? '').startsWith('dep');
    return depSide(c.sourceHandle) === depSide(c.targetHandle);
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      if ((c.sourceHandle ?? '').startsWith('dep')) {
        // dependency wire (step→step)
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
      // chain rewire: one outgoing from source, one incoming into target
      setEdges((es) => [
        ...es.filter(
          (e) =>
            !(e.sourceHandle === 'out' && (e.source === c.source || e.target === c.target)),
        ),
        chainEdge({ source: c.source, target: c.target }),
      ]);
    },
    [nodes, setEdges, setNodes],
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
        // place below the current tail (last node without an outgoing chain edge)
        const outs = new Set(
          ns.filter((n) => edges.some((e) => e.source === n.id && e.sourceHandle === 'out')).map((n) => n.id),
        );
        const tail = [...ns].reverse().find((n) => !outs.has(n.id)) ?? ns[ns.length - 1];
        const pos = tail ? { x: tail.position.x, y: tail.position.y + 150 } : { x: 60, y: 60 };
        const next = [...ns, { id: mod.id!, type: 'fd' as const, position: pos, data: { mod } as never, deletable: false }];
        if (tail) {
          setEdges((es) => [...es, chainEdge({ source: tail.id, target: mod.id! })]);
        }
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

  const nodeTypes = useMemo(() => ({ fd: FDNode }), []);

  return (
    <FDContext.Provider value={{ dict, lang: 'zh', onUpdate: updateMod, onConvert: convertSuggestion }}>
      <div className="relative h-full w-full">
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
                {(['step', 'question', 'suggestion', 'risk', 'checkpoint', 'resource', 'group'] as const).map((t) => (
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
        </div>

        <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} color="#e4e4e7" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => nodeColor((n as FDNodeT).data.mod)}
          className="!bottom-3 !right-3"
        />
        </ReactFlow>
      </div>
    </FDContext.Provider>
  );
}

export function FlowView(props: FlowViewProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
