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
 * Turn the wire graph back into an ordered plan: walk the chain from its head,
 * then append any unreachable nodes in their original order (a broken chain
 * must never lose modules). Positions and dependsOn references are preserved.
 */
export function linearizePlan(
  plan: Plan,
  chainEdges: GraphEdge[],
  positions?: Record<string, Point>,
): Plan {
  const byId = new Map(plan.modules.map((m) => [m.id, m]));
  const out = new Map<string, string>();
  const hasIncoming = new Set<string>();
  for (const e of chainEdges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (!out.has(e.source)) out.set(e.source, e.target); // first outgoing wins
    hasIncoming.add(e.target);
  }

  const head = plan.modules.find((m) => m.id && !hasIncoming.has(m.id))?.id;
  const order: string[] = [];
  const visited = new Set<string>();
  let cur = head;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    order.push(cur);
    cur = out.get(cur);
  }
  for (const m of plan.modules) {
    if (m.id && !visited.has(m.id)) {
      visited.add(m.id);
      order.push(m.id);
    }
  }

  const stepIds = new Set(plan.modules.filter((m) => m.type === 'step').map((m) => m.id));
  const modules: PlanModule[] = order
    .map((id) => byId.get(id)!)
    .filter(Boolean)
    .map((m) => {
      const next = { ...m };
      if (positions && next.id && positions[next.id]) next.pos = positions[next.id];
      if (next.type === 'step' && next.dependsOn) {
        next.dependsOn = next.dependsOn.filter((d) => stepIds.has(d) && d !== next.id);
        if (next.dependsOn.length === 0) delete next.dependsOn;
      }
      return next;
    });

  return { ...plan, modules };
}

/**
 * Deterministic auto-layout: one row per group (nodes between group markers),
 * nodes spaced along the chain. Group band nodes anchor the row start.
 */
export function defaultLayout(plan: Plan): Record<string, Point> {
  const chain = linearizePlan(plan, chainFromOrder(plan.modules));
  const layout: Record<string, Point> = {};
  let row = 0;
  let col = 0;
  for (const m of chain.modules) {
    if (!m.id) continue;
    if (m.type === 'group') {
      if (col > 0) {
        row += 1;
        col = 0;
      }
      layout[m.id] = { x: 0, y: row * 210 };
      col = 1;
      continue;
    }
    layout[m.id] = { x: col * 270, y: row * 210 + (m.type === 'step' ? 0 : 26) };
    col += 1;
  }
  return layout;
}
