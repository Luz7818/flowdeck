import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plan, PlanModule, chainFromOrder, defaultLayout, linearizePlan } from '@flowdeck/core';
import { FDNode, nodeColor, FDContext, PHASE_COLORS, type FDNodeT } from './FlowNode.js';
import { TypeGlyph } from '../components/TypeGlyph.js';
import { CanvasArt } from '../components/CanvasArt.js';
import { newId } from '../id.js';
import { useIsDark } from '../theme.js';
import { safeStorage } from '../storage.js';
import { Dict } from '../i18n.js';

// strokes ride CSS vars so a theme toggle re-colors every stored edge instantly;
// arrow markers are value-generated SVG (per-use color), themed via `arrowColor`
const CHAIN_STYLE = { stroke: 'var(--fd-chain-stroke)', strokeWidth: 1.8 };
const DEP_STYLE = { stroke: 'var(--fd-dep-stroke)', strokeWidth: 1.3, strokeDasharray: '5 4' };
const ARROW = (color: string) => ({ type: MarkerType.ArrowClosed as const, color, width: 14, height: 14 });
/** light: matches the zinc-600 chain stroke; dark: the lighter #a1a1aa stroke */
const arrowColorFor = (dark: boolean) => (dark ? '#a1a1aa' : '#52525b');

function chainEdge(e: { source: string; target: string }, arrowColor: string): Edge {
  return {
    id: `chain-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'wire',
    style: CHAIN_STYLE,
    markerEnd: ARROW(arrowColor),
    reconnectable: true,
  };
}

function depEdge(source: string, target: string, arrowColor: string): Edge {
  return {
    id: `dep-${source}-${target}`,
    source,
    target,
    sourceHandle: 'dep-out',
    targetHandle: 'dep-in',
    type: 'wire',
    style: DEP_STYLE,
    markerEnd: ARROW(arrowColor),
    reconnectable: true,
  };
}

/** selectable wire: click to select → drag endpoints to re-route, × / Delete to remove */
function WireEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, selected } = props;
  const { deleteElements } = useReactFlow();
  const { entrance } = useContext(FDContext);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });
  // deleteElements routes the removal through onEdgesChange/onEdgesDelete, so the
  // undo history sees it and dependency wires clean up their dependsOn entries
  const remove = () => deleteElements({ edges: [{ id }] });
  const baseWidth = (style?.strokeWidth as number) ?? 1.5;
  const wireStyle = selected ? { ...style, strokeWidth: baseWidth + 0.8, stroke: '#2563eb', filter: 'drop-shadow(0 0 5px rgb(37 99 235 / 0.45))' } : style;
  const dashed = Boolean((style as { strokeDasharray?: string } | undefined)?.strokeDasharray);
  // one-shot entrance (first paint only): solid chain wires draw themselves in
  const pathStyle =
    entrance && !dashed
      ? { ...wireStyle, strokeDasharray: 1400, animation: 'fd-draw 0.55s var(--ease-out-expo) both' }
      : wireStyle;
  return (
    <>
      {/* double-click removes the wire outright (single click selects it) */}
      <g className={entrance ? 'animate-fade-in' : undefined} onDoubleClick={remove}>
        <BaseEdge id={id} path={path} style={pathStyle} markerEnd={markerEnd} />
      </g>
      {selected && (
        <EdgeLabelRenderer>
          <button
            onClick={remove}
            aria-label="delete wire"
            className="nodrag nopan animate-pop-in absolute flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-[11px] font-bold leading-none text-zinc-500 shadow-md transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-red-500/50 dark:hover:bg-red-500/15 dark:hover:text-red-400"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function planToFlow(plan: Plan, arrowColor: string): { nodes: FDNodeT[]; edges: Edge[] } {
  const layout = defaultLayout(plan);
  const nodes: FDNodeT[] = [];
  let groupId: string | null = null;
  let groupAbs = { x: 0, y: 0 };
  let groupCollapsed = false;
  plan.modules.forEach((m, i) => {
    const abs = m.pos ?? layout[m.id!] ?? { x: 0, y: 0 };
    if (m.type === 'group') {
      groupId = m.id!;
      groupAbs = abs;
      groupCollapsed = Boolean(m.collapsed);
      nodes.push({ id: m.id!, type: 'fd', position: abs, data: { mod: m, idx: i } as never, deletable: false });
      return;
    }
    // members after a group in module order are its children (relative positions)
    nodes.push(
      groupId
        ? {
            id: m.id!,
            type: 'fd',
            parentId: groupId,
            extent: 'parent',
            position: { x: abs.x - groupAbs.x, y: abs.y - groupAbs.y },
            hidden: groupCollapsed,
            data: { mod: m, idx: i } as never,
            deletable: false,
          }
        : { id: m.id!, type: 'fd', position: abs, data: { mod: m, idx: i } as never, deletable: false },
    );
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = chainFromOrder(plan.modules)
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => chainEdge(e, arrowColor));
  for (const m of plan.modules) {
    if (m.type !== 'step' || !m.dependsOn) continue;
    for (const d of m.dependsOn) {
      if (ids.has(d) && d !== m.id) edges.push(depEdge(d, m.id!, arrowColor));
    }
  }
  return { nodes, edges };
}

type XY = { x: number; y: number };

/** does adding source→target to these chain edges close a cycle through target? */
function closesChainCycle(edges: Edge[], source: string, target: string): boolean {
  const outMap = new Map<string, string[]>();
  for (const e of edges) {
    if (e.sourceHandle !== 'out') continue;
    const list = outMap.get(e.source);
    if (list) list.push(e.target);
    else outMap.set(e.source, [e.target]);
  }
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === source) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    const next = outMap.get(n);
    if (next) stack.push(...next);
  }
  return false;
}

/** child absolute = parent absolute + relative (parents are never children) */
function absolutePositions(ns: FDNodeT[], layout?: Record<string, XY>): Map<string, XY> {
  const byId = new Map(ns.map((n) => [n.id, n]));
  const memo = new Map<string, XY>();
  const absOf = (n: FDNodeT): XY => {
    const cached = memo.get(n.id);
    if (cached) return cached;
    const own = layout?.[n.id] ?? n.position;
    let a = own;
    if (!layout?.[n.id] && n.parentId && byId.has(n.parentId)) {
      const p = absOf(byId.get(n.parentId)!);
      a = { x: own.x + p.x, y: own.y + p.y };
    }
    memo.set(n.id, a);
    return a;
  };
  ns.forEach(absOf);
  return memo;
}

const GROUP_PAD = { top: 64, x: 28, bottom: 28 };
const BAND_SIZE = { width: 330, height: 56 };

/** keep phase containers fitted around their members and collapse states in sync.
 *  returns null when everything already matches (identity → effect loop ends) */
function normalizeGroups(ns: FDNodeT[]): FDNodeT[] | null {
  let changed = false;
  const next = [...ns];
  for (let i = 0; i < next.length; i++) {
    const g = next[i];
    if (g.data.mod.type !== 'group') continue;
    const collapsed = Boolean(g.data.mod.collapsed);
    const childIdx: number[] = [];
    next.forEach((c, ci) => {
      if (c.parentId === g.id) childIdx.push(ci);
    });

    if (collapsed) {
      childIdx.forEach((idx) => {
        if (!next[idx].hidden) {
          next[idx] = { ...next[idx], hidden: true };
          changed = true;
        }
      });
      const w = (g.style?.width as number) ?? 0;
      const h = (g.style?.height as number) ?? 0;
      if (Math.abs(w - BAND_SIZE.width) > 1 || Math.abs(h - BAND_SIZE.height) > 1) {
        next[i] = { ...g, style: { ...(g.style ?? {}), width: BAND_SIZE.width, height: BAND_SIZE.height } };
        changed = true;
      }
      continue;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let anyHidden = false;
    childIdx.forEach((idx) => {
      const c = next[idx];
      const ax = g.position.x + c.position.x;
      const ay = g.position.y + c.position.y;
      const w = c.measured?.width ?? 252;
      const h = c.measured?.height ?? 96;
      minX = Math.min(minX, ax);
      minY = Math.min(minY, ay);
      maxX = Math.max(maxX, ax + w);
      maxY = Math.max(maxY, ay + h);
      if (c.hidden) anyHidden = true;
    });
    if (!childIdx.length) {
      minX = g.position.x + GROUP_PAD.x;
      minY = g.position.y + GROUP_PAD.top;
      maxX = minX + 340;
      maxY = minY + 200;
    }
    const target = {
      x: minX - GROUP_PAD.x,
      y: minY - GROUP_PAD.top,
      width: maxX - minX + GROUP_PAD.x * 2,
      height: maxY - minY + GROUP_PAD.top + GROUP_PAD.bottom,
    };
    const curW = (g.style?.width as number) ?? 0;
    const curH = (g.style?.height as number) ?? 0;
    const dx = target.x - g.position.x;
    const dy = target.y - g.position.y;
    const sizeChanged = Math.abs(curW - target.width) > 1 || Math.abs(curH - target.height) > 1;
    const posChanged = Math.abs(dx) > 1 || Math.abs(dy) > 1;
    if (anyHidden || sizeChanged || posChanged) {
      // shift children so their ABSOLUTE positions survive the parent move
      childIdx.forEach((idx) => {
        const c = next[idx];
        const hidden = c.hidden ? { hidden: false } : {};
        next[idx] = { ...c, ...hidden, position: { x: c.position.x - dx, y: c.position.y - dy } };
      });
      next[i] = {
        ...g,
        position: { x: target.x, y: target.y },
        style: { ...(g.style ?? {}), width: target.width, height: target.height },
        hidden: false,
      };
      changed = true;
    }
  }
  return changed ? next : null;
}

/** defaults for a freshly added module, phrased in the current UI language */
function defaultsFor(type: string, dict: Dict): Partial<PlanModule> {
  switch (type) {
    case 'step':
      return { title: dict.newStep };
    case 'question':
      return { question: dict.newQuestion, options: [dict.optYes, dict.optNo] };
    case 'suggestion':
      return { title: dict.newSuggestion };
    case 'risk':
      return { note: dict.newRisk, level: 'warn' };
    case 'checkpoint':
      return { title: dict.newCheckpoint, criteria: [] };
    case 'resource':
      return { label: dict.newResource };
    case 'group':
      return { title: dict.newPhase };
    default:
      return {};
  }
}

const PALETTE_TYPES = ['step', 'question', 'suggestion', 'risk', 'checkpoint', 'resource', 'group'] as const;

export interface FlowViewProps {
  plan: Plan;
  dict: Dict;
  lang: 'zh' | 'en';
  /** canvas host version (from the WS init) — shown in the tips modal */
  hostVersion?: string | null;
  /** 确认方案 pressed — light the cards up in chain order, then the Splash lands */
  confirming?: boolean;
  /** App registers this to pull the linearized plan on confirm */
  registerCommit: (fn: (() => Plan) | null) => void;
  /** header stat chips follow the canvas as it is edited */
  onStats?: (stats: { steps: number; open: number }) => void;
  /** edit-preservation: debounced pushes of the edited plan to the host, so a
   *  page refresh restores the edits instead of the original draft */
  onAutosave?: (plan: Plan) => void;
}

function Inner({ plan, dict, lang, hostVersion, confirming, registerCommit, onStats, onAutosave }: FlowViewProps) {
  const dark = useIsDark();
  const arrowColor = arrowColorFor(dark);
  const initial = useMemo(() => planToFlow(plan, arrowColor), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<FDNodeT>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const { fitView, setCenter, zoomTo } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const updateNodeInternals = useUpdateNodeInternals();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(() => !safeStorage.get('flowdeck.tips.seen.v2'));
  const [legendOpen, setLegendOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** keyboard-highlighted row in the search results (↑/↓ move, Enter jumps) */
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => setActiveIdx(0), [query]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const storeApi = useStoreApi();

  /**
   * Frameless/occluded webviews never fire rAF — d3-zoom transitions
   * (setCenter/fitView with a duration) then stall on frame zero forever.
   * Probe once at mount: healthy → smooth camera flights; dead → snap.
   */
  const rafHealthy = useRef(true);
  useEffect(() => {
    let fired = false;
    requestAnimationFrame(() => {
      fired = true;
    });
    const t = setTimeout(() => {
      rafHealthy.current = fired;
    }, 120);
    return () => clearTimeout(t);
  }, []);
  const camDuration = useCallback((ms: number) => (rafHealthy.current ? ms : 0), []);

  /** boot camera: center the plan's entry node — the canvas opens at "start here",
   *  not fitView-all; the fit button and minimap remain the global navigation.
   *  Snap (no duration): measurement-independent and dead-rAF safe. */
  useEffect(() => {
    const chain = initial.edges
      .filter((e) => e.sourceHandle === 'out' && e.targetHandle === 'in')
      .map((e) => ({ source: e.source, target: e.target }));
    const first = linearizePlan(plan, chain).modules[0];
    const node = first?.id ? initial.nodes.find((n) => n.id === first.id) : undefined;
    if (!node) return;
    const parent = node.parentId ? initial.nodes.find((n) => n.id === node.parentId) : undefined;
    const abs = parent
      ? { x: parent.position.x + node.position.x + 126, y: parent.position.y + node.position.y + 60 }
      : { x: node.position.x + 126, y: node.position.y + 60 };
    setCenter(abs.x, abs.y, { zoom: 0.95 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- undo/redo over the canvas state (nodes + edges) ---------- */
  type Snapshot = { nodes: FDNodeT[]; edges: Edge[] };
  const stateRef = useRef<{ nodes: FDNodeT[]; edges: Edge[] }>({ nodes, edges });
  stateRef.current = { nodes, edges };
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const snapshot = useCallback(
    (): Snapshot => ({
      // fresh objects so later immutable mutations never leak into stored states;
      // fresh (auto-edit flag) is stripped so undo/redo rebuilds don't re-enter editing
      nodes: stateRef.current.nodes.map(({ data, ...n }) => ({
        ...n,
        selected: false,
        data: { ...data, fresh: undefined, mod: { ...data.mod } },
      })),
      edges: stateRef.current.edges.map((e) => ({ ...e, style: e.style ? { ...e.style } : undefined })),
    }),
    [],
  );
  const syncHist = useCallback(() => setHist({ past: past.current.length, future: future.current.length }), []);
  const pushHistory = useCallback(() => {
    past.current.push(snapshot());
    if (past.current.length > 50) past.current.shift();
    future.current = [];
    syncHist();
  }, [snapshot, syncHist]);
  /**
   * Wholesale state restore + canvas rebuild. Restoring incrementally through
   * xyflow's edge diff leaves a stale invalid internal for an edge whose
   * endpoints were absent in the previous state (redo re-adding a module) —
   * the wire never renders again, in any later re-push. Remounting <ReactFlow>
   * (key=flowEpoch) rebuilds its internals from the restored snapshot instead.
   * History lives in Inner, so past/future survive the remount.
   */
  const [flowEpoch, setFlowEpoch] = useState(0);
  /** camera to restore after an undo/redo remount (xyflow resets to the default viewport) */
  const [bootViewport, setBootViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  /** markerEnd is a value-generated SVG — restamp stored edges on theme flips
   *  AND on undo/redo remounts (snapshots may carry a pre-toggle marker color) */
  useEffect(() => {
    setEdges((es) => es.map((e) => (e.markerEnd ? { ...e, markerEnd: ARROW(arrowColor) } : e)));
  }, [arrowColor, flowEpoch, setEdges]);
  const applySnapshot = useCallback(
    (snap: Snapshot) => {
      const [x, y, zoom] = storeApi.getState().transform;
      setBootViewport({ x, y, zoom });
      setNodes(snap.nodes);
      setEdges(snap.edges);
      setFlowEpoch((e) => e + 1);
    },
    [setEdges, setNodes, storeApi],
  );
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(snapshot());
    applySnapshot(prev);
    syncHist();
  }, [applySnapshot, snapshot, syncHist]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snapshot());
    applySnapshot(next);
    syncHist();
  }, [applySnapshot, snapshot, syncHist]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      // don't hijack native undo while typing in text fields
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo();
      else undo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /** snapshot at drag-start (first streaming frame = pre-move state) and before removals */
  const draggingRef = useRef(false);

  /** Delete on a selected node = exclude (soft), never delete — modules stay recoverable */
  const [excludeHint, setExcludeHint] = useState(false);
  const hintShownRef = useRef(false);
  const hintTimer = useRef<number | null>(null);
  /** cycle-formed toast (non-blocking — linearize expands cycles from entries) */
  const [cycleHint, setCycleHint] = useState(false);
  const cycleTimer = useRef<number | null>(null);
  const showCycleHint = useCallback(() => {
    setCycleHint(true);
    if (cycleTimer.current) clearTimeout(cycleTimer.current);
    cycleTimer.current = window.setTimeout(() => setCycleHint(false), 3800);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const selected = stateRef.current.nodes.filter((n) => n.selected);
      if (!selected.length) return;
      e.preventDefault();
      pushHistory();
      setNodes((ns) =>
        ns.map((n) =>
          n.selected && n.data.mod.type !== 'group'
            ? { ...n, data: { ...n.data, mod: { ...n.data.mod, excluded: true } } }
            : n,
        ),
      );
      if (!hintShownRef.current) {
        hintShownRef.current = true;
        setExcludeHint(true);
        hintTimer.current = window.setTimeout(() => setExcludeHint(false), 3500);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      if (cycleTimer.current) clearTimeout(cycleTimer.current);
    };
  }, [pushHistory, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<FDNodeT>[]) => {
      for (const c of changes) {
        if (c.type === 'position') {
          if (c.dragging && !draggingRef.current) {
            pushHistory();
            draggingRef.current = true;
          }
          if (!c.dragging) draggingRef.current = false;
        } else if (c.type === 'remove') {
          pushHistory();
        }
      }
      onNodesChange(changes);
    },
    [onNodesChange, pushHistory],
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === 'remove')) pushHistory();
      onEdgesChange(changes);
    },
    [onEdgesChange, pushHistory],
  );

  const updateMod = useCallback(
    (id: string, next: PlanModule) => {
      pushHistory();
      // phase collapse/expand resizes the lane and (un)hides its members —
      // glide it like tidy does instead of snapping (skipped while dragging,
      // no-op in rAF-dead webviews where transitions never get frames)
      const prev = stateRef.current.nodes.find((n) => n.id === id)?.data.mod;
      if (
        prev?.type === 'group' &&
        next.type === 'group' &&
        Boolean(prev.collapsed) !== Boolean(next.collapsed) &&
        !draggingRef.current
      ) {
        rootRef.current?.classList.add('fd-relayout');
        setTimeout(() => rootRef.current?.classList.remove('fd-relayout'), 400);
      }
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, mod: next } } : n)));
    },
    [pushHistory, setNodes],
  );

  const convertSuggestion = useCallback(
    (id: string) => {
      pushHistory();
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n;
          const mod = n.data.mod;
          if (mod.type !== 'suggestion') return n;
          return { ...n, selected: true, data: { ...n.data, mod: { ...mod, type: 'step' } } };
        }),
      );
      // fly the camera to the converted card so the change is unmissable
      const n = stateRef.current.nodes.find((x) => x.id === id);
      if (n) setCenter(n.position.x + 126, n.position.y + 60, { zoom: 0.95, duration: camDuration(500) });
    },
    [camDuration, pushHistory, setCenter, setNodes],
  );

  /** wire the node data into nodes state before serializing */
  const getPlan = useCallback((): Plan => {
    const abs = absolutePositions(nodes);
    const mods = abs.size ? nodes.map((n) => ({ ...n.data.mod, pos: abs.get(n.id) })) : nodes.map((n) => n.data.mod);
    const base: Plan = { ...planRef.current, modules: mods };
    const chain = edges
      .filter((e) => e.sourceHandle === 'out' && e.targetHandle === 'in')
      .map((e) => ({ source: e.source, target: e.target }));
    const positions = Object.fromEntries([...abs.entries()]);
    return linearizePlan(base, chain, positions);
  }, [nodes, edges]);

  /** phase containers hug their members; collapse hides them (both directions) */
  useEffect(() => {
    setNodes((ns) => normalizeGroups(ns) ?? ns);
  }, [nodes]);

  const commitRef = useRef(getPlan);
  commitRef.current = getPlan;
  useEffect(() => {
    registerCommit(() => commitRef.current());
    return () => registerCommit(null);
  }, [registerCommit]);

  /**
   * Edit preservation: 2.5s after the last canvas change, push the linearized
   * plan to the host so a refresh/reconnect restores the edits. The first run
   * only records the pristine plan (nothing user-made to save yet); identical
   * serializations are skipped, and confirming short-circuits (session ends).
   */
  const lastAutosaveRef = useRef<string | null>(null);
  useEffect(() => {
    if (confirming) return;
    const t = window.setTimeout(() => {
      const json = JSON.stringify(getPlan());
      if (lastAutosaveRef.current === null) {
        lastAutosaveRef.current = json;
        return;
      }
      if (json === lastAutosaveRef.current) return;
      lastAutosaveRef.current = json;
      onAutosave?.(getPlan());
    }, 2500);
    return () => clearTimeout(t);
  }, [nodes, edges, confirming, getPlan, onAutosave]);

  /**
   * Some embedded webviews ship a dead ResizeObserver — and occluded/minimized
   * windows stop producing rendering frames entirely, so neither RO nor rAF
   * ever fires. xyflow then never measures nodes (visibility:hidden, no edges).
   * Poll a few times: if edges are missing while nodes exist, measure manually —
   * DOM queries + the store's updateNodeInternals action, no frames required.
   */
  const nodeIdsRef = useRef<string[]>([]);
  nodeIdsRef.current = nodes.map((n) => n.id!);
  const [measurementFixed, setMeasurementFixed] = useState(false);
  /** DOM-direct measurement of every node — no frames required (AGENTS.md 已知坑) */
  const measureAll = useCallback((): boolean => {
    const { domNode, updateNodeInternals: applyInternals } = storeApi.getState();
    if (!domNode) return false;
    const updates = new Map<string, { id: string; nodeElement: HTMLDivElement; force: boolean }>();
    nodeIdsRef.current.forEach((id) => {
      const el = domNode.querySelector<HTMLDivElement>(`.react-flow__node[data-id="${id}"]`);
      if (el) updates.set(id, { id, nodeElement: el, force: true });
    });
    if (updates.size) {
      applyInternals(updates, { triggerFitView: false });
      return true;
    }
    return false;
  }, [storeApi]);
  // canvas rebuilds (undo/redo) re-mount <ReactFlow> with unmeasured nodes —
  // re-arm the boot fallback so its poll re-measures against the fresh mount
  useEffect(() => {
    if (flowEpoch === 0) return;
    setMeasurementFixed(false);
  }, [flowEpoch]);
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
      measureAll();
    }, 300);
    return () => clearInterval(t);
  }, [measurementFixed, measureAll]);

  /**
   * The boot fallback above stops once edges render — but nodes mounted later
   * (add module / convert suggestion) hit the same dead-RO frameless webviews
   * and stay visibility:hidden forever, so their wires never appear. Watch for
   * node-count growth and re-run the same DOM-direct measurement for them.
   */
  const nodeCountRef = useRef(initial.nodes.length);
  useEffect(() => {
    const grew = nodes.length > nodeCountRef.current;
    nodeCountRef.current = nodes.length;
    if (!grew) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      const { domNode, updateNodeInternals: applyInternals } = storeApi.getState();
      if (!domNode) {
        if (tries > 10) clearInterval(t);
        return;
      }
      const hidden = [...domNode.querySelectorAll<HTMLDivElement>('.react-flow__node')].filter((el) => el.style.visibility === 'hidden');
      if (!hidden.length || tries > 10) {
        clearInterval(t);
        return;
      }
      const updates = new Map<string, { id: string; nodeElement: HTMLDivElement; force: boolean }>();
      hidden.forEach((el) => {
        const id = el.getAttribute('data-id');
        if (id) updates.set(id, { id, nodeElement: el, force: true });
      });
      if (updates.size) applyInternals(updates, { triggerFitView: false });
    }, 500);
    return () => clearInterval(t);
  }, [nodes, storeApi]);

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
      pushHistory();
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
        setEdges((es) => [...es.filter((e) => !(e.id === `dep-${c.source}-${c.target}`)), depEdge(c.source, c.target, arrowColor)]);
        return;
      }
      // read current state top-level (updaters must stay pure — see addModule)
      const es = stateRef.current.edges;
      if (
        es.some(
          (e) =>
            e.sourceHandle === 'out' &&
            e.targetHandle === 'in' &&
            e.source === c.source &&
            e.target === c.target,
        )
      ) {
        return; // exact duplicate — no-op
      }
      // cycles stay legal (linearize expands from entries), but say so right away
      if (closesChainCycle(es, c.source!, c.target!)) showCycleHint();
      setEdges([...es, chainEdge({ source: c.source, target: c.target }, arrowColor)]);
    },
    [arrowColor, nodes, pushHistory, setEdges, setNodes, showCycleHint],
  );

  /** drag an existing wire's endpoint to re-route it (chain → chain, dep → dep) */
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      if (!newConn.source || !newConn.target || newConn.source === newConn.target) return;
      pushHistory();
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
        setEdges((es) => es.filter((e) => e.id !== oldEdge.id).concat(depEdge(newConn.source, newConn.target, arrowColor)));
        return;
      }
      setEdges((es) => es.filter((e) => e.id !== oldEdge.id).concat(chainEdge({ source: newConn.source, target: newConn.target }, arrowColor)));
      // re-routing can close a loop too — same immediate heads-up as onConnect
      const remaining = stateRef.current.edges.filter((e) => e.id !== oldEdge.id);
      if (closesChainCycle(remaining, newConn.source, newConn.target)) showCycleHint();
    },
    [arrowColor, pushHistory, setEdges, setNodes, showCycleHint],
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
      pushHistory();
      const mod = { type, id: newId(type), ...defaultsFor(type, dict) } as PlanModule;
      // read current state (not the setNodes updater) so the chain edge is a
      // plain top-level setEdges — nesting it inside the updater is unreliable
      // under concurrent rendering (the wire silently never appeared)
      const ns = stateRef.current.nodes;
      const outs = new Set(
        stateRef.current.edges.filter((e) => e.sourceHandle === 'out').map((e) => e.source),
      );
      const tail = [...ns].reverse().find((n) => !outs.has(n.id)) ?? ns[ns.length - 1];
      // empty canvas (modules: [] plans): no tail to chain from — drop the first
      // module top-level at the origin, the regular layout takes over from there
      const parentId = tail
        ? (tail.parentId ?? (tail.data.mod.type === 'group' ? tail.id : undefined))
        : undefined;
      const pos = !tail
        ? { x: 0, y: 0 }
        : tail.parentId
          ? { x: tail.position.x, y: tail.position.y + 150 }
          : tail.data.mod.type === 'group'
            ? { x: GROUP_PAD.x, y: GROUP_PAD.top }
            : { x: tail.position.x, y: tail.position.y + 150 };
      // deselect everything and highlight the newcomer
      setNodes([
        ...ns.map((n) => ({ ...n, selected: false })),
        {
          id: mod.id!,
          type: 'fd' as const,
          ...(parentId ? { parentId, extent: 'parent' as const } : {}),
          position: pos,
          selected: true,
          data: { mod, idx: ns.length, fresh: true } as never,
          deletable: false,
          // seed dimensions so the card is visible immediately: frameless
          // webviews never fire the ResizeObserver that normally measures
          // fresh nodes (they'd stay visibility:hidden forever); the real
          // measurement overwrites this as soon as it lands
          measured: { width: mod.type === 'group' ? 330 : 252, height: mod.type === 'group' ? 56 : 96 },
        },
      ]);
      if (tail) setEdges((es) => [...es, chainEdge({ source: tail.id, target: mod.id! }, arrowColor)]);
      // camera: fly to the new card's ABSOLUTE position (groups are top-level so
      // their position is already absolute; children are relative to it)
      const parentAbs = parentId ? (ns.find((n) => n.id === parentId)?.position ?? { x: 0, y: 0 }) : null;
      const newAbs = parentAbs
        ? { x: parentAbs.x + pos.x + 126, y: parentAbs.y + pos.y + 60 }
        : { x: pos.x + 126, y: pos.y + 60 };
      setCenter(newAbs.x, newAbs.y, { zoom: 0.95, duration: camDuration(500) });
    },
    [arrowColor, camDuration, dict, pushHistory, setCenter, setEdges, setNodes],
  );

  const tidy = useCallback(() => {
    pushHistory();
    const p = getPlan();
    const layout = defaultLayout(p);
    if (!draggingRef.current) {
      // let the reposition glide instead of snapping (no-op in rAF-dead webviews)
      rootRef.current?.classList.add('fd-relayout');
      setTimeout(() => rootRef.current?.classList.remove('fd-relayout'), 400);
    }
    const abs = absolutePositions(nodes, layout);
    const absById = new Map(abs.entries());
    const byId = new Map(nodes.map((n) => [n.id, n]));
    setNodes((ns) =>
      ns.map((n) => {
        const a = absById.get(n.id) ?? { x: n.position.x, y: n.position.y };
        if (!n.parentId) return { ...n, position: a };
        const parent = byId.get(n.parentId);
        const parentAbs = parent ? (absById.get(parent.id) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
        return { ...n, position: { x: a.x - parentAbs.x, y: a.y - parentAbs.y } };
      }),
    );
    setTimeout(() => fitView({ padding: 0.15, duration: camDuration(300) }), 60);
  }, [camDuration, fitView, getPlan, nodes, pushHistory, setNodes]);

  /* ---------- derived: phase colors + step numbering + stats + overview lists ---------- */
  const { colorMap, orderMap, stats, openQuestions, answeredQuestions, risks, suggestions, excludedNodes } = useMemo(() => {
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
    const aq = live((m) => m.type === 'question' && Boolean(m.answer));
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
        excluded: nodes.length - live(() => true).length,
      },
      openQuestions: oq.map((n) => ({ id: n.id, mod: n.data.mod })),
      answeredQuestions: aq.map((n) => ({ id: n.id, mod: n.data.mod })),
      risks: rk.map((n) => ({ id: n.id, mod: n.data.mod })),
      suggestions: sg.map((n) => ({ id: n.id, mod: n.data.mod })),
      excludedNodes: nodes.filter((n) => n.data.mod.excluded).map((n) => ({ id: n.id, mod: n.data.mod })),
    };
  }, [nodes, edges]);

  const colorOf = useCallback((m: PlanModule) => colorMap.get(m.id!) ?? PHASE_COLORS[0], [colorMap]);
  const stepNo = useCallback((id: string) => orderMap.get(id) ?? null, [orderMap]);
  const orderMapRef = useRef(orderMap);
  orderMapRef.current = orderMap;

  /** header chips follow canvas edits (canvas is the single editing surface);
   *  guarded so drag-frame re-renders don't spam the parent */
  const reportedStats = useRef('');
  useEffect(() => {
    const key = `${stats.steps}:${stats.open}`;
    if (key === reportedStats.current) return;
    reportedStats.current = key;
    onStats?.({ steps: stats.steps, open: stats.open });
  }, [onStats, stats]);

  /** confirmation wave: stamp each card with its chain position so CSS staggers
   *  them in order; also freeze dragging so the wave reads as one composed beat */
  useEffect(() => {
    if (!confirming) return;
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        draggable: false,
        data: { ...n.data, wave: orderMapRef.current.get(n.id) ?? 99 },
      })),
    );
  }, [confirming, setNodes]);

  /** overview click: select the node (blue ring) so it's findable, then center on it */
  const focus = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      const abs = absolutePositions(nodes).get(id) ?? n.position;
      setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === id })));
      setCenter(abs.x + 126, abs.y + 60, { zoom: 0.95, duration: camDuration(500) });
    },
    [camDuration, nodes, setCenter, setNodes],
  );

  /** steps stat chip: zoom back out to the whole plan */
  const focusFirstStep = useCallback(() => {
    fitView({ padding: 0.18, duration: camDuration(400) });
  }, [camDuration, fitView]);


  const closeTips = useCallback(() => {
    setTipsOpen(false);
    safeStorage.set('flowdeck.tips.seen.v2', '1');
  }, []);

  /* ---------- module search (dock button / Ctrl+F / Ctrl+K) ---------- */
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const textOf = (m: PlanModule): string => {
      const rec = m as Record<string, unknown>;
      return [rec.title, rec.question, rec.note, rec.label, rec.detail]
        .filter((v): v is string => typeof v === 'string')
        .join(' ');
    };
    const labelOf = (m: PlanModule): string => {
      const rec = m as Record<string, unknown>;
      const v = rec.title ?? rec.question ?? rec.note ?? rec.label ?? rec.detail;
      return typeof v === 'string' && v ? v : m.type;
    };
    return nodes
      .filter((n) => !n.data.mod.excluded && textOf(n.data.mod).toLowerCase().includes(q))
      .slice(0, 8)
      .map((n) => ({ id: n.id, mod: n.data.mod, label: labelOf(n.data.mod) }));
  }, [nodes, query]);
  const jumpTo = useCallback(
    (id: string) => {
      focus(id);
      setSearchOpen(false);
      setQuery('');
    },
    [focus],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
        // don't hijack the browser find / our own fields while typing
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === 'Escape' && searchOpen) setSearchOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen]);
  // the panel stays mounted (palette's keep-mounted pattern) — autofocus can't
  // re-fire on an inert element, so opening focuses the input imperatively
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  /* popovers: close on Escape / click outside */
  const rootRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!paletteOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof window.Node)) return;
      if (paletteRef.current && !paletteRef.current.contains(t)) setPaletteOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [paletteOpen]);
  useEffect(() => {
    if (!tipsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTips();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tipsOpen, closeTips]);

  const nodeTypes = useMemo(() => ({ fd: FDNode }), []);
  const edgeTypes = useMemo(() => ({ wire: WireEdge }), []);
  const ctxValue = useMemo(
    () => ({ dict, lang, onUpdate: updateMod, onConvert: convertSuggestion, colorOf, stepNo, focus, entrance: flowEpoch === 0 }),
    [dict, lang, updateMod, convertSuggestion, colorOf, stepNo, focus, flowEpoch],
  );

  const progressPct = stats.questionsAll > 0 ? Math.round((stats.answered / stats.questionsAll) * 100) : 100;

  // one keep-mounted toast slot serves both hints; the last message is held so
  // the exit transition has content to fade instead of an empty pill
  const lastHintRef = useRef('');
  const hintMsg = cycleHint ? dict.cycleHint : excludeHint ? dict.excludeHint : '';
  useEffect(() => {
    if (hintMsg) lastHintRef.current = hintMsg;
  }, [hintMsg]);
  const shownHint = hintMsg || lastHintRef.current;
  const shownHintIsCycle = hintMsg ? cycleHint : lastHintRef.current === dict.cycleHint;

  return (
    <FDContext.Provider value={ctxValue}>
      <div ref={rootRef} className={`relative h-full w-full bg-gradient-to-br from-zinc-50 via-sky-50/40 to-violet-50/30 dark:from-zinc-950 dark:via-slate-950/40 dark:to-violet-950/30 ${confirming ? 'fd-confirming' : ''}`}>
        {/* ambient aurora — below the canvas, above the base gradient */}
        <div className="fd-aurora" aria-hidden>
          <span className="fd-aurora-a" />
          <span className="fd-aurora-b" />
          <span className="fd-aurora-c" />
        </div>
        {/* static lens vignette: shades the viewport edges for depth (no motion) */}
        <div className="fd-vignette" aria-hidden />
        {/* top dock: actions + stats in one frosted bar */}
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-xl border border-zinc-200 bg-white/90 py-1.5 pl-2 pr-3 shadow-lift backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="relative" ref={paletteRef}>
            <button
              onClick={() => setPaletteOpen((v) => !v)}
              aria-expanded={paletteOpen}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium shadow-lift ${
                paletteOpen
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200'
              }`}
            >
              + {dict.addModule}
            </button>
            <div
              className={`fd-pop absolute left-0 top-9 z-20 w-44 origin-top-left overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-overlay dark:border-zinc-700 dark:bg-zinc-900 ${paletteOpen ? 'fd-pop-open' : ''}`}
            >
                {PALETTE_TYPES.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => addModule(t)}
                    style={{ '--i': i } as React.CSSProperties}
                    className="fd-palette-item flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                      style={{ background: `${nodeColor({ type: t } as PlanModule)}1f`, color: nodeColor({ type: t } as PlanModule) }}
                    >
                      <TypeGlyph type={t} className="h-2.5 w-2.5" />
                    </span>
                    {(dict as Record<string, string>)[`p${t[0].toUpperCase()}${t.slice(1)}`] ?? t}
                  </button>
                ))}
              </div>
            </div>
          <button
            onClick={undo}
            disabled={hist.past === 0}
            aria-label={dict.undo}
            title={dict.undo}
            className="rounded-lg px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path d="M3.5 7h6.5a3.25 3.25 0 1 1 0 6.5H7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 3.5 3 7l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={hist.future === 0}
            aria-label={dict.redo}
            title={dict.redo}
            className="rounded-lg px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 -scale-x-100">
              <path d="M3.5 7h6.5a3.25 3.25 0 1 1 0 6.5H7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 3.5 3 7l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={tidy}
            title={dict.tidy}
            aria-label={dict.tidy}
            className="rounded-lg px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path d="M2.5 4h11M2.5 8h7M2.5 12h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            aria-expanded={searchOpen}
            aria-label={dict.search}
            title={dict.search}
            className={`rounded-lg px-2 py-1.5 dark:hover:bg-zinc-800 ${
              searchOpen ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400'
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="m10.4 10.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => fitView({ padding: 0.18, duration: camDuration(400) })}
            aria-label={dict.fitView}
            title={dict.fitView}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-600 shadow-card hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => setTipsOpen(true)}
            title={dict.help}
            aria-label={dict.help}
            className="rounded-lg px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path d="M5.8 6a2.2 2.2 0 1 1 3 2c-.7.35-1.05.8-1.05 1.6v.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="7.85" cy="12.6" r="0.9" fill="currentColor" />
            </svg>
          </button>
          <button
            onClick={() => zoomTo(1, { duration: camDuration(300) })}
            aria-label={dict.zoomReset}
            title={dict.zoomReset}
            className="hidden w-11 rounded-lg py-1.5 text-2xs font-semibold tabular-nums text-zinc-500 hover:bg-zinc-100 sm:block dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {Math.round(zoom * 100)}%
          </button>
          <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
          <div className="hidden items-center gap-3 px-1 md:flex">
            <Stat value={stats.steps} label={dict.step} color="#3b82f6" onClick={focusFirstStep} title={dict.fitView} />
            <Stat value={stats.phases} label={dict.statsPhase} color="#7c3aed" />
            <Stat
              value={stats.open}
              label={dict.question}
              color="#f59e0b"
              onClick={stats.open > 0 ? () => openQuestions[0] && focus(openQuestions[0].id) : undefined}
              title={stats.open > 0 ? dict.question : undefined}
            />
            <Stat
              value={stats.risks}
              label={dict.risk}
              color="#f97316"
              onClick={stats.risks > 0 ? () => risks[0] && focus(risks[0].id) : undefined}
              title={stats.risks > 0 ? dict.risk : undefined}
            />
            <Stat value={stats.excluded} label={dict.excluded} color="#a1a1aa" />
            <div className="w-16">
              <div className="mb-1 text-right text-3xs font-medium text-zinc-500 dark:text-zinc-400">{progressPct}%</div>
              <div className="h-1 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* module search: type to filter, click a result to fly to it.
            Keep-mounted like the palette so the exit animates too; the outer
            div owns the centering (fd-pop's transform would drop it), inert
            keeps the hidden input out of the tab order */}
        <div className={`absolute left-1/2 top-16 z-20 w-80 -translate-x-1/2 ${searchOpen ? '' : 'pointer-events-none'}`}>
          <div
            inert={!searchOpen}
            className={`fd-pop origin-top overflow-hidden rounded-xl border border-zinc-200 bg-white/95 p-1 shadow-overlay backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 ${searchOpen ? 'fd-pop-open' : ''}`}
          >
            <div className="flex items-center gap-2 px-2 py-1">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden>
                <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="m10.4 10.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(i + 1, searchResults.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    if (searchResults[activeIdx]) {
                      e.preventDefault();
                      jumpTo(searchResults[activeIdx].id);
                    }
                  }
                }}
                placeholder={dict.searchPh}
                aria-label={dict.search}
                className="w-full bg-transparent py-1 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 dark:text-zinc-200 dark:placeholder:text-zinc-500"
              />
            </div>
            {query.trim() && (
              <div className="fd-scroll max-h-56 overflow-y-auto border-t border-zinc-100 pt-1 dark:border-zinc-800">
                {searchResults.length === 0 && (
                  <p className="px-3 py-2.5 text-2xs text-zinc-400 dark:text-zinc-500">{dict.noMatch}</p>
                )}
                {searchResults.map(({ id, mod, label }, i) => (
                  <button
                    key={id}
                    onClick={() => jumpTo(id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${
                      i === activeIdx ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                      style={{ background: `${nodeColor(mod)}1f`, color: nodeColor(mod) }}
                    >
                      <TypeGlyph type={mod.type} className="h-2.5 w-2.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-2xs text-zinc-700 dark:text-zinc-300">
                      {highlightMatch(label, query.trim())}
                    </span>
                    <span className="shrink-0 text-3xs text-zinc-400 dark:text-zinc-500">
                      {(dict as Record<string, string>)[mod.type] ?? mod.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* overview panel */}
        <div className="absolute right-3 top-3 z-10 hidden w-64 md:block">
          <div className="fd-glass overflow-hidden rounded-xl border border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
            <button
              onClick={() => setOverviewOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              {dict.overview}
              <span className={`text-zinc-400 transition-transform duration-200 dark:text-zinc-600 ${overviewOpen ? '' : '-rotate-90'}`}>⌄</span>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out-expo ${overviewOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <div className={`fd-scroll max-h-[46vh] space-y-3 overflow-y-auto px-3 pb-3 ${overviewOpen ? 'fd-stagger' : ''}`}>
                {openQuestions.length + risks.length + suggestions.length + answeredQuestions.length + excludedNodes.length === 0 && (
                  <div className="py-3 text-center">
                    <div className="mx-auto mb-2 grid w-fit grid-cols-2 gap-1 opacity-30">
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-400 dark:bg-zinc-600" />
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-300 dark:bg-zinc-600" />
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-300 dark:bg-zinc-600" />
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-200 dark:bg-zinc-700" />
                    </div>
                    <p className="text-2xs text-zinc-400 dark:text-zinc-600">{dict.overviewEmpty}</p>
                  </div>
                )}
                {answeredQuestions.length > 0 && (
                  <section>
                    <p className="mb-1 text-3xs font-semibold uppercase tracking-wider text-emerald-500">{dict.answeredSection}</p>
                    {answeredQuestions.map(({ id, mod }) => {
                      const q = mod as { question: string; answer?: string | null };
                      return (
                        <button
                          key={id}
                          onClick={() => focus(id)}
                          className="mb-1 block w-full truncate rounded-lg border border-emerald-100 bg-emerald-50/60 px-2 py-1.5 text-left text-2xs text-zinc-700 hover:border-emerald-300 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-zinc-300 dark:hover:border-emerald-500/50"
                          title={`${q.question} → ${q.answer ?? ''}`}
                        >
                          {q.question} <span className="font-semibold text-emerald-600 dark:text-emerald-400">→ {q.answer}</span>
                        </button>
                      );
                    })}
                  </section>
                )}
                {excludedNodes.length > 0 && (
                  <section>
                    <p className="mb-1 text-3xs font-semibold uppercase tracking-wider text-zinc-400">{dict.excluded}</p>
                    {excludedNodes.map(({ id, mod }) => {
                      const rec = mod as Record<string, unknown>;
                      const v = rec.title ?? rec.question ?? rec.note ?? rec.label ?? rec.detail;
                      const label = typeof v === 'string' && v ? v : mod.type;
                      return (
                        <div key={id} className="mb-1 flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50/60 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/40">
                          <button
                            onClick={() => focus(id)}
                            className="min-w-0 flex-1 truncate text-left text-2xs text-zinc-400 line-through hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                          >
                            {label}
                          </button>
                          <button
                            onClick={() => updateMod(id, { ...mod, excluded: false })}
                            className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-3xs font-medium text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          >
                            ↺ {dict.restore}
                          </button>
                        </div>
                      );
                    })}
                  </section>
                )}
                {openQuestions.length > 0 && (
                  <section>
                    <p className="mb-1 text-3xs font-semibold uppercase tracking-wider text-amber-500">{dict.question}</p>
                    {openQuestions.map(({ id, mod }) => (
                      <button
                        key={id}
                        onClick={() => focus(id)}
                        className="mb-1 block w-full truncate rounded-lg border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-left text-2xs text-zinc-700 hover:border-amber-300 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-zinc-300 dark:hover:border-amber-500/50"
                      >
                        {(mod as { question: string }).question}
                      </button>
                    ))}
                  </section>
                )}
                {risks.length > 0 && (
                  <section>
                    <p className="mb-1 text-3xs font-semibold uppercase tracking-wider text-orange-500">{dict.risk}</p>
                    {risks.map(({ id, mod }) => (
                      <button
                        key={id}
                        onClick={() => focus(id)}
                        className="mb-1 block w-full truncate rounded-lg border border-orange-100 bg-orange-50/60 px-2 py-1.5 text-left text-2xs text-zinc-700 hover:border-orange-300 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-zinc-300 dark:hover:border-orange-500/50"
                      >
                        {(mod as { note: string }).note}
                      </button>
                    ))}
                  </section>
                )}
                {suggestions.length > 0 && (
                  <section>
                    <p className="mb-1 text-3xs font-semibold uppercase tracking-wider text-violet-500">{dict.suggestion}</p>
                    {suggestions.map(({ id, mod }) => {
                      const s = mod as { title: string };
                      return (
                        <div
                          key={id}
                          className="mb-1 flex items-center gap-1 rounded-lg border border-violet-100 bg-violet-50/60 px-2 py-1.5 dark:border-violet-500/25 dark:bg-violet-500/10"
                        >
                          <button
                            onClick={() => focus(id)}
                            className="min-w-0 flex-1 truncate text-left text-2xs text-zinc-700 hover:text-violet-600 dark:text-zinc-300 dark:hover:text-violet-400"
                          >
                            {s.title}
                          </button>
                          <button
                            onClick={() => updateMod(id, { ...(mod as PlanModule), adopted: true } as PlanModule)}
                            className="shrink-0 rounded-full bg-violet-500 px-2 py-0.5 text-3xs font-medium text-white hover:bg-violet-400"
                          >
                            {dict.adopt}
                          </button>
                        </div>
                      );
                    })}
                  </section>
                )}
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* legend: both states stay mounted and crossfade through the same
            anchor (fd-pop-x keeps translate(-50%) centering while popping) */}
        <div className="absolute bottom-16 left-1/2 z-10 h-6">
          <div
            className={`fd-pop-x absolute bottom-0 left-1/2 flex w-max max-w-[94vw] origin-bottom flex-wrap items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white/90 px-3 py-1.5 shadow-lift backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 ${
              legendOpen ? 'fd-pop-open' : ''
            }`}
          >
            {(['step', 'question', 'suggestion', 'risk', 'checkpoint', 'resource'] as const).map((t) => (
              <span key={t} className="flex items-center gap-1 text-3xs text-zinc-500 dark:text-zinc-400">
                <span
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-sm"
                  style={{ color: nodeColor({ type: t } as PlanModule) }}
                >
                  <TypeGlyph type={t} className="h-2.5 w-2.5" />
                </span>
                {(dict as Record<string, string>)[t] ?? t}
              </span>
            ))}
            <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
            <svg width="30" height="8">
              <line x1="0" y1="4" x2="30" y2="4" stroke="var(--fd-chain-stroke)" strokeWidth="1.8" />
            </svg>
            <span className="text-3xs text-zinc-500 dark:text-zinc-400">{dict.flowView}</span>
            <svg width="30" height="8">
              <line x1="0" y1="4" x2="30" y2="4" stroke="var(--fd-dep-stroke)" strokeWidth="1.3" strokeDasharray="5 4" />
            </svg>
            <span className="text-3xs text-zinc-500 dark:text-zinc-400">{dict.dependsOn}</span>
            <button onClick={() => setLegendOpen(false)} aria-label={dict.legend} className="ml-1 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400">
              ×
            </button>
          </div>
          <button
            onClick={() => setLegendOpen(true)}
            aria-label={dict.legend}
            className={`fd-pop-x absolute bottom-0 left-1/2 whitespace-nowrap rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-3xs text-zinc-500 shadow-card backdrop-blur hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:bg-zinc-800 ${
              legendOpen ? '' : 'fd-pop-open'
            }`}
          >
            {dict.legend}
          </button>
        </div>

        {/* tips popover */}
        <div
          className={`absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-200 ${tipsOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onMouseDown={closeTips}
        >
          <div className="absolute inset-0 bg-zinc-900/25 backdrop-blur-[2px] dark:bg-black/50" />
          <div
            className={`fd-glass relative w-[340px] rounded-2xl border border-zinc-200 bg-white/95 p-5 backdrop-blur transition-all duration-200 dark:border-zinc-700 dark:bg-zinc-900/95 ${tipsOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-2xs text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">✦</span>
              {dict.tipsTitle}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  svg: (
                    <svg viewBox="0 0 72 48" className="h-11 w-full text-zinc-500">
                      <rect x="4" y="4" width="26" height="15" rx="4" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.2" />
                      <rect x="42" y="30" width="26" height="15" rx="4" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.2" />
                      <path d="M17 19v8h25v-3" fill="none" stroke="#52525b" strokeWidth="1.6" />
                      <path d="M38 20l4 4-6 1" fill="none" stroke="#52525b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                  caption: dict.tip2,
                },
                {
                  svg: (
                    <svg viewBox="0 0 72 48" className="h-11 w-full text-zinc-500">
                      <rect x="4" y="16" width="26" height="15" rx="4" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.2" />
                      <rect x="42" y="16" width="26" height="15" rx="4" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.2" />
                      <path d="M42 24H32" fill="none" stroke="#0891b2" strokeWidth="1.6" strokeDasharray="4 3" />
                      <path d="M35 20l-4 4 4 4" fill="none" stroke="#0891b2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                  caption: dict.tip3,
                },
                {
                  svg: (
                    <svg viewBox="0 0 72 48" className="h-11 w-full text-zinc-500">
                      <rect x="6" y="8" width="60" height="32" rx="4" fill="none" stroke="#2563eb" strokeWidth="1.3" strokeDasharray="4 3" />
                      <rect x="14" y="16" width="18" height="12" rx="3" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.1" />
                      <rect x="40" y="22" width="18" height="12" rx="3" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.1" />
                    </svg>
                  ),
                  caption: dict.tip6,
                },
                {
                  svg: (
                    <svg viewBox="0 0 72 48" className="h-11 w-full text-zinc-500">
                      <circle cx="10" cy="12" r="3" fill="currentColor" opacity=".5" />
                      <circle cx="22" cy="26" r="3" fill="currentColor" opacity=".5" />
                      <circle cx="12" cy="38" r="3" fill="currentColor" opacity=".5" />
                      <path d="M32 24h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path d="M41 20l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="52" y="8" width="14" height="9" rx="2.5" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.1" />
                      <rect x="52" y="20" width="14" height="9" rx="2.5" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.1" />
                      <rect x="52" y="32" width="14" height="9" rx="2.5" className="fill-blue-100 dark:fill-blue-500/20" stroke="#3b82f6" strokeWidth="1.1" />
                    </svg>
                  ),
                  caption: dict.tip4,
                },
              ].map(({ svg, caption }, i) => (
                <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-2 dark:border-zinc-800 dark:bg-zinc-800/40">
                  {svg}
                  <p className="mt-1.5 text-2xs leading-snug text-zinc-600 dark:text-zinc-400">{caption}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-2xs leading-relaxed text-zinc-400 dark:text-zinc-600">
              {dict.tip1} · {dict.tip5}
            </p>
            <p className="mt-1.5 text-2xs leading-relaxed text-zinc-400 dark:text-zinc-600">{dict.shortcuts}</p>
            <div className="mt-4 text-right">
              <button
                onClick={closeTips}
                className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {dict.gotIt}
              </button>
              {hostVersion && (
                <p className="mt-2 text-3xs tabular-nums text-zinc-300 dark:text-zinc-600">FlowDeck v{hostVersion}</p>
              )}
            </div>
          </div>
        </div>

        {/* toast slot: keep-mounted so enter and exit ride the same transition
            (both hints auto-clear; one slot can never self-overlap) */}
        <div
          role="status"
          className={`fd-toast absolute bottom-32 left-1/2 z-20 ${hintMsg ? '' : 'fd-toast-hidden'} ${
            shownHintIsCycle ? 'border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300' : ''
          }`}
        >
          {shownHint}
        </div>

        {/* empty-plan guide: no modules yet — invite the first add */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 z-[5] grid place-items-center">
            <div className="fd-glass w-72 animate-pop-in rounded-2xl border border-zinc-200 bg-white/95 px-8 py-6 text-center backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
              <CanvasArt className="mx-auto mb-4 h-20 w-full" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{dict.emptyPlan}</p>
              <button
                onClick={() => setPaletteOpen(true)}
                className="mt-3 rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                + {dict.addModule}
              </button>
            </div>
          </div>
        )}

        <ReactFlow
          key={flowEpoch}
          defaultViewport={bootViewport}
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onReconnect={onReconnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          edgesReconnectable
          connectionRadius={40}
          connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '6 4' }}
          panOnScroll
          zoomOnPinch
          zoomOnScroll={false}
          selectionOnDrag
          panOnDrag={[1, 2]}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          {/* base dot grid + a low-density cross layer aligned to every 6th dot
              (22×6=132) — quiet drafting-paper texture behind the canvas */}
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color={dark ? '#2b2b31' : '#dce0ea'} />
          <Background variant={BackgroundVariant.Cross} gap={132} size={2.6} lineWidth={1} color={dark ? 'rgb(255 255 255 / 0.045)' : 'rgb(15 23 42 / 0.055)'} />
          <Controls showInteractive={false} className="!bottom-16 !left-3" />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const m = (n as FDNodeT).data.mod;
              return m.type === 'group' ? colorOf(m) : nodeColor(m);
            }}
            maskColor={dark ? 'rgb(0 0 0 / 0.5)' : 'rgb(15 23 42 / 0.09)'}
            maskStrokeColor="#3b82f6"
            maskStrokeWidth={1.5}
            className="!bottom-16 !right-3 animate-fade-in"
          />
        </ReactFlow>
      </div>
    </FDContext.Provider>
  );
}

/** render label with the first case-insensitive match wrapped in a soft mark */
function highlightMatch(label: string, q: string): React.ReactNode {
  if (!q) return label;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-zinc-800 dark:bg-amber-500/30 dark:text-amber-200">
        {label.slice(i, i + q.length)}
      </mark>
      {label.slice(i + q.length)}
    </>
  );
}

function Stat({ value, label, color, onClick, title }: { value: number; label: string; color: string; onClick?: () => void; title?: string }) {
  const chip = (
    <>
      {/* key on value: every change replays the pop */}
      <span key={value} className="stat-pop text-sm font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="whitespace-nowrap text-3xs text-zinc-500 dark:text-zinc-400">{label}</span>
    </>
  );
  if (!onClick) {
    return <div className="flex items-center gap-1.5">{chip}</div>;
  }
  return (
    <button onClick={onClick} title={title} aria-label={title} className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
      {chip}
    </button>
  );
}

export function FlowView(props: FlowViewProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
