import { Plan, PlanModule } from './schema.js';

export interface GraphEdge {
  source: string;
  target: string;
}
export interface Point {
  x: number;
  y: number;
}

/** Chain edges following the current module order (the "AI draft" wiring). */
export function chainFromOrder(modules: PlanModule[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < modules.length - 1; i++) {
    if (modules[i].id && modules[i + 1].id) {
      edges.push({ source: modules[i].id!, target: modules[i + 1].id! });
    }
  }
  return edges;
}

/**
 * Turn the wire graph back into an ordered plan. Chain wires form a free
 * directed graph (branches allowed): the order is a depth-first pre-order walk
 * from every entry node (no incoming wire), entries taken in module order and a
 * node's out-edges expanded sorted by the target's module order, so the same
 * graph always linearizes the same way. Anything unreachable — broken chains,
 * cycles — is appended in module order: a broken chain must never lose modules.
 * Positions and dependsOn references are preserved.
 */
export function linearizePlan(
  plan: Plan,
  chainEdges: GraphEdge[],
  positions?: Record<string, Point>,
): Plan {
  const byId = new Map(plan.modules.map((m) => [m.id, m]));
  const orderIndex = new Map(plan.modules.map((m, i) => [m.id, i] as const));
  const out = new Map<string, string[]>();
  const hasIncoming = new Set<string>();
  for (const e of chainEdges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) continue;
    const targets = out.get(e.source) ?? [];
    if (!targets.includes(e.target)) targets.push(e.target);
    out.set(e.source, targets);
    hasIncoming.add(e.target);
  }
  for (const targets of out.values()) {
    targets.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  }

  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    order.push(id);
    for (const next of out.get(id) ?? []) visit(next);
  };
  const heads = plan.modules.filter((m) => m.id && !hasIncoming.has(m.id)).map((m) => m.id!);
  if (!heads.length && plan.modules[0]?.id) heads.push(plan.modules[0].id); // full cycle → pseudo entry
  for (const id of heads) visit(id);
  for (const m of plan.modules) {
    if (m.id) visit(m.id);
  }

  const stepIds = new Set(plan.modules.filter((m) => m.type === 'step').map((m) => m.id));
  const excludedIds = new Set(plan.modules.filter((m) => m.excluded && m.id).map((m) => m.id!));
  const modules: PlanModule[] = order
    .map((id) => byId.get(id)!)
    .filter(Boolean)
    .map((m) => {
      const next = { ...m };
      if (positions && next.id && positions[next.id]) next.pos = positions[next.id];
      if (next.type === 'step' && next.dependsOn) {
        // a removed step is a prerequisite for nobody: dependency references to
        // excluded steps drop out of the confirmed plan (summary does the same)
        next.dependsOn = next.dependsOn.filter(
          (d) => stepIds.has(d) && d !== next.id && !excludedIds.has(d),
        );
        if (next.dependsOn.length === 0) delete next.dependsOn;
      }
      return next;
    });

  return { ...plan, modules };
}

/** Canvas flow direction: 'lr' = horizontal chain (wide windows), 'tb' =
 *  vertical chain (narrow panels — VS Code-family sidebar default). */
export type LayoutDirection = 'lr' | 'tb';

/**
 * Deterministic auto-layout: one row per group (nodes between group markers),
 * nodes spaced along the chain. Group band nodes anchor the row start.
 * With direction 'tb' the axes swap: one column per group, the chain flows
 * top-to-bottom (handles already sit on top/bottom, so wires stay vertical).
 */
export function defaultLayout(plan: Plan, opts?: { direction?: LayoutDirection }): Record<string, Point> {
  const chain = linearizePlan(plan, chainFromOrder(plan.modules));
  const tb = opts?.direction === 'tb';
  const layout: Record<string, Point> = {};
  let row = 0;
  let col = 0;
  for (const m of chain.modules) {
    if (!m.id) continue;
    if (m.type === 'group') {
      if (tb) {
        if (row > 0) {
          col += 1;
          row = 0;
        }
        layout[m.id] = { x: col * 380, y: 0 };
        row = 1;
      } else {
        if (col > 0) {
          row += 1;
          col = 0;
        }
        layout[m.id] = { x: 0, y: row * 230 };
        col = 1;
      }
      continue;
    }
    if (tb) {
      // 260 row pitch clears the tallest card with ~80px so handles stay grabbable;
      // 380 col pitch per group mirrors the 332 lr pitch plus band padding
      layout[m.id] = { x: col * 380 + (m.type === 'step' ? 0 : 26), y: row * 260 };
      row += 1;
    } else {
      // 332 col pitch leaves ~80px between nodes so side handles stay grabbable
      layout[m.id] = { x: col * 332, y: row * 230 + (m.type === 'step' ? 0 : 26) };
      col += 1;
    }
  }
  return layout;
}
