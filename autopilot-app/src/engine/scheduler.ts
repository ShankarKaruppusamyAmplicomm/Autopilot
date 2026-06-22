import type { Project, Dependency, ScheduleNode, ScheduleResult, ItemLevel } from '../types';
import { nodeKey } from '../types';

function teFromPert(o: number, m: number, p: number) {
  return (o + 4 * m + p) / 6;
}
function varianceFromPert(o: number, p: number) {
  return Math.pow((p - o) / 6, 2);
}

/**
 * Runs forward + backward pass over a flat list of projects (portfolio-level).
 * Returns ScheduleResult with computed ES/EF/LS/LF/slack/isCritical per node.
 */
export function computePortfolioSchedule(
  projects: Project[],
  deps: Dependency[],
): ScheduleResult {
  const nodes = new Map<string, ScheduleNode>();

  // Build nodes
  for (const p of projects) {
    const key = nodeKey('project', p.id);
    let te: number;
    let variance: number | null = null;
    let estimatePending = false;

    if (p.pertO != null && p.pertM != null && p.pertP != null) {
      te = teFromPert(p.pertO, p.pertM, p.pertP);
      variance = varianceFromPert(p.pertO, p.pertP);
    } else if (p.startDate && p.endDate) {
      const s = new Date(p.startDate).getTime();
      const e = new Date(p.endDate).getTime();
      te = Math.max(0, (e - s) / (1000 * 60 * 60 * 24 * 7));
      estimatePending = true;
    } else {
      te = 1;
      estimatePending = true;
    }

    nodes.set(key, {
      id: p.id, level: 'project', name: p.name,
      te, variance, estimatePending,
      ES: 0, EF: 0, LS: 0, LF: 0, slack: 0, isCritical: false,
      color: p.color, owner: p.owner, status: p.status,
      startDate: p.startDate, endDate: p.endDate,
      pertO: p.pertO, pertM: p.pertM, pertP: p.pertP,
    });
  }

  // Filter only project-level deps
  const projDeps = deps.filter(
    d => d.predecessorLevel === 'project' && d.successorLevel === 'project',
  );

  return runSchedule(nodes, projDeps.map(d => ({
    from: nodeKey('project', d.predecessorId),
    to: nodeKey('project', d.successorId),
    lag: d.lagDays / 7, // convert days to weeks
  })));
}

interface Edge { from: string; to: string; lag: number; }

function runSchedule(nodes: Map<string, ScheduleNode>, edges: Edge[]): ScheduleResult {
  // Build adjacency
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const predecessorsOf = new Map<string, string[]>();

  for (const key of nodes.keys()) {
    adj.set(key, []);
    inDegree.set(key, 0);
    predecessorsOf.set(key, []);
  }

  for (const e of edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    predecessorsOf.get(e.to)!.push(e.from);
  }

  // Topological sort (Kahn's)
  const queue: string[] = [];
  for (const [k, deg] of inDegree) {
    if (deg === 0) queue.push(k);
  }
  const topo: string[] = [];
  const tempInDeg = new Map(inDegree);
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const nb of adj.get(id) ?? []) {
      const nd = (tempInDeg.get(nb) ?? 1) - 1;
      tempInDeg.set(nb, nd);
      if (nd === 0) queue.push(nb);
    }
  }

  // Edge lag lookup
  const lagOf = new Map<string, number>();
  for (const e of edges) {
    lagOf.set(`${e.from}→${e.to}`, e.lag);
  }

  // Forward pass
  for (const key of topo) {
    const node = nodes.get(key)!;
    const preds = predecessorsOf.get(key) ?? [];
    if (preds.length === 0) {
      node.ES = 0;
    } else {
      node.ES = Math.max(...preds.map(pk => {
        const pn = nodes.get(pk)!;
        const lag = lagOf.get(`${pk}→${key}`) ?? 0;
        return pn.EF + lag;
      }));
    }
    node.EF = node.ES + node.te;
  }

  const projectEnd = Math.max(0, ...[...nodes.values()].map(n => n.EF));

  // Backward pass
  for (const key of [...topo].reverse()) {
    const node = nodes.get(key)!;
    const succs = adj.get(key) ?? [];
    if (succs.length === 0) {
      node.LF = projectEnd;
    } else {
      node.LF = Math.min(...succs.map(sk => {
        const sn = nodes.get(sk)!;
        const lag = lagOf.get(`${key}→${sk}`) ?? 0;
        return sn.LS - lag;
      }));
    }
    node.LS = node.LF - node.te;
    node.slack = Math.round((node.LF - node.EF) * 1000) / 1000;
    node.isCritical = Math.abs(node.slack) < 0.01;
  }

  // Identify critical chain
  const criticalChain: string[] = [];
  const critNodes = [...nodes.entries()].filter(([, n]) => n.isCritical);
  if (critNodes.length) {
    // Walk from smallest ES to largest EF along critical edges
    const critSet = new Set(critNodes.map(([k]) => k));
    let cur = critNodes.reduce((a, b) => a[1].ES < b[1].ES ? a : b)[0];
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      criticalChain.push(cur);
      const next = (adj.get(cur) ?? []).find(s => critSet.has(s) && !visited.has(s));
      cur = next ?? '';
    }
  }

  return { nodes, projectEnd, criticalChain };
}

/**
 * Cycle detection via DFS — returns cycle path if found, null if DAG.
 */
export function detectCycle(
  existingDeps: Array<{ predecessorId: number; successorId: number }>,
  newFrom: number,
  newTo: number,
): number[] | null {
  const adj = new Map<number, number[]>();
  const allDeps = [...existingDeps, { predecessorId: newFrom, successorId: newTo }];
  for (const d of allDeps) {
    if (!adj.has(d.predecessorId)) adj.set(d.predecessorId, []);
    adj.get(d.predecessorId)!.push(d.successorId);
  }

  const visited = new Set<number>();
  const recStack = new Set<number>();
  const path = new Map<number, number>();

  function dfs(node: number): number[] | null {
    visited.add(node);
    recStack.add(node);
    for (const nb of adj.get(node) ?? []) {
      if (!visited.has(nb)) {
        path.set(nb, node);
        const cycle = dfs(nb);
        if (cycle) return cycle;
      } else if (recStack.has(nb)) {
        // Reconstruct cycle
        const cycle: number[] = [nb];
        let cur = node;
        while (cur !== nb) {
          cycle.unshift(cur);
          cur = path.get(cur) ?? nb;
        }
        cycle.unshift(nb);
        return cycle;
      }
    }
    recStack.delete(node);
    return null;
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }
  return null;
}
