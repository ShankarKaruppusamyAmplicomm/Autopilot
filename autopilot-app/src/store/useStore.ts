import { create } from 'zustand';
import { db, ensureWorkspace, exportBackup, importBackup, restoreFromLatestBackup, recordVisit } from '../db';
import { computePortfolioSchedule, detectCycle } from '../engine/scheduler';
import {
  fetchPortfolio,
  apiCreateProject, apiUpdateProject, apiDeleteProject, apiReorderProjects,
  apiCreateVersion, apiUpdateVersion, apiDeleteVersion,
  apiCreatePhase, apiUpdatePhase, apiDeletePhase,
  apiCreateTask, apiUpdateTask, apiDeleteTask,
  apiCreateDependency, apiDeleteDependency,
  patchWorkspace as apiPatchWorkspace,
  apiImportPortfolio,
} from '../api/client';
import { withAuth } from './useAuthPrompt';
import type {
  Workspace, Project, Version, Phase, Task, Dependency,
  ScheduleResult, ItemLevel,
} from '../types';

interface AppState {
  workspace: Workspace | null;
  projects: Project[];
  versions: Version[];
  phases: Phase[];
  tasks: Task[];
  dependencies: Dependency[];
  scheduleResult: ScheduleResult | null;
  loading: boolean;
  lastEditAt: number | null;
  /** true when server is unreachable — app falls back to local IndexedDB */
  offline: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;

  renameWorkspace: (name: string) => Promise<void>;

  addProject: (p: Omit<Project, 'id' | 'workspaceId' | 'order'>) => Promise<number>;
  updateProject: (id: number, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  reorderProjects: (ids: number[]) => Promise<void>;

  addVersion: (v: Omit<Version, 'id' | 'order'>) => Promise<number>;
  updateVersion: (id: number, patch: Partial<Version>) => Promise<void>;
  deleteVersion: (id: number) => Promise<void>;

  addPhase: (p: Omit<Phase, 'id' | 'order'>) => Promise<number>;
  updatePhase: (id: number, patch: Partial<Phase>) => Promise<void>;
  deletePhase: (id: number) => Promise<void>;

  addTask: (t: Omit<Task, 'id'>) => Promise<number>;
  updateTask: (id: number, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;

  addDependency: (
    predecessorId: number, successorId: number,
    predecessorLevel: ItemLevel, successorLevel: ItemLevel,
    type?: Dependency['type'], lagDays?: number
  ) => Promise<{ ok: boolean; cycleNames?: string[] }>;
  removeDependency: (id: number) => Promise<void>;

  exportJSON: () => Promise<void>;
  importJSON: (json: string) => Promise<void>;
  clearAll: () => Promise<void>;

  _reload: (markEdit?: boolean) => Promise<void>;
  _recompute: () => void;
}

let _initStarted = false;

// ── Mapping helpers: server snake_case → frontend camelCase ───────────────────

function mapProject(p: Record<string, unknown>): Project {
  return {
    id:          p.id as number,
    workspaceId: (p.workspace_id ?? p.workspaceId) as number,
    name:        p.name as string,
    description: (p.description as string) ?? undefined,
    owner:       (p.owner as string) ?? undefined,
    status:      (p.status as Project['status']) ?? 'pending',
    startDate:   (p.start_date ?? p.startDate) as string ?? undefined,
    endDate:     (p.end_date ?? p.endDate) as string ?? undefined,
    color:       (p.color as string) ?? '#58A6FF',
    order:       (p.sort_order ?? p.order) as number ?? 0,
    pertO:       (p.pert_o ?? p.pertO) as number ?? undefined,
    pertM:       (p.pert_m ?? p.pertM) as number ?? undefined,
    pertP:       (p.pert_p ?? p.pertP) as number ?? undefined,
  };
}

function mapVersion(v: Record<string, unknown>): Version {
  return {
    id:        v.id as number,
    projectId: (v.project_id ?? v.projectId) as number,
    label:     v.label as string,
    startDate: (v.start_date ?? v.startDate) as string ?? undefined,
    endDate:   (v.end_date ?? v.endDate) as string ?? undefined,
    owner:     (v.owner as string) ?? undefined,
    order:     (v.sort_order ?? v.order) as number ?? 0,
    pertO:     (v.pert_o ?? v.pertO) as number ?? undefined,
    pertM:     (v.pert_m ?? v.pertM) as number ?? undefined,
    pertP:     (v.pert_p ?? v.pertP) as number ?? undefined,
  };
}

function mapPhase(p: Record<string, unknown>): Phase {
  return {
    id:        p.id as number,
    projectId: (p.project_id ?? p.projectId) as number,
    versionId: (p.version_id ?? p.versionId) as number ?? undefined,
    label:     p.label as string,
    startDate: (p.start_date ?? p.startDate) as string ?? undefined,
    endDate:   (p.end_date ?? p.endDate) as string ?? undefined,
    owner:     (p.owner as string) ?? undefined,
    order:     (p.sort_order ?? p.order) as number ?? 0,
    pertO:     (p.pert_o ?? p.pertO) as number ?? undefined,
    pertM:     (p.pert_m ?? p.pertM) as number ?? undefined,
    pertP:     (p.pert_p ?? p.pertP) as number ?? undefined,
  };
}

function mapTask(t: Record<string, unknown>): Task {
  return {
    id:          t.id as number,
    phaseId:     (t.phase_id ?? t.phaseId) as number,
    name:        t.name as string,
    owner:       (t.owner as string) ?? undefined,
    optimistic:  (t.optimistic as number) ?? undefined,
    mostLikely:  (t.most_likely ?? t.mostLikely) as number ?? undefined,
    pessimistic: (t.pessimistic as number) ?? undefined,
  };
}

function mapDep(d: Record<string, unknown>): Dependency {
  return {
    id:               d.id as number,
    predecessorId:    (d.predecessor_id ?? d.predecessorId) as number,
    successorId:      (d.successor_id ?? d.successorId) as number,
    predecessorLevel: (d.predecessor_level ?? d.predecessorLevel) as ItemLevel,
    successorLevel:   (d.successor_level ?? d.successorLevel) as ItemLevel,
    type:             (d.type as Dependency['type']) ?? 'FS',
    lagDays:          (d.lag_days ?? d.lagDays) as number ?? 0,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useStore = create<AppState>((set, get) => ({
  workspace: null,
  projects: [],
  versions: [],
  phases: [],
  tasks: [],
  dependencies: [],
  scheduleResult: null,
  loading: true,
  lastEditAt: null,
  offline: false,

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    if (_initStarted) return;
    _initStarted = true;

    // 1. Try server (source of truth)
    const portfolio = await fetchPortfolio();

    if (portfolio) {
      set({ offline: false });
      const ws: Workspace = portfolio.workspaces[0]
        ? { id: portfolio.workspaces[0].id, name: portfolio.workspaces[0].name,
            createdAt: portfolio.workspaces[0].created_at, schemaVersion: portfolio.workspaces[0].schema_version }
        : { id: 1, name: 'Truflo AI', createdAt: new Date().toISOString(), schemaVersion: 1 };

      const projects     = (portfolio.projects     as unknown as Record<string,unknown>[]).map(mapProject);
      const versions     = (portfolio.versions     as unknown as Record<string,unknown>[]).map(mapVersion);
      const phases       = (portfolio.phases       as unknown as Record<string,unknown>[]).map(mapPhase);
      const tasks        = (portfolio.tasks        as unknown as Record<string,unknown>[]).map(mapTask);
      const dependencies = (portfolio.dependencies as unknown as Record<string,unknown>[]).map(mapDep);

      set({ workspace: ws, projects, versions, phases, tasks, dependencies, loading: false });
      get()._recompute();

      // Mirror into IndexedDB as offline cache (best-effort)
      _mirrorToIndexedDB(ws, projects, versions, phases, tasks, dependencies).catch(() => {});

    } else {
      // 2. Server unreachable — fall back to IndexedDB
      set({ offline: true });
      const allWs = await db.workspaces.toArray();
      let ws = allWs[0];
      if (!ws) {
        const id = await db.workspaces.add({ id: undefined as unknown as number, name: 'Truflo AI', createdAt: new Date().toISOString(), schemaVersion: 1 });
        ws = (await db.workspaces.get(id))!;
      }
      const restored = await restoreFromLatestBackup();
      if (!restored) await seedTrufloData(ws.id as number);
      await get()._reload();
      set({ workspace: ws, loading: false });
      get()._recompute();
    }

    recordVisit().catch(() => {});
  },

  // ── Refresh (pull latest from server) ─────────────────────────────────────
  async refresh() {
    const portfolio = await fetchPortfolio();
    if (!portfolio) return;
    set({ offline: false });
    const ws: Workspace = portfolio.workspaces[0]
      ? { id: portfolio.workspaces[0].id, name: portfolio.workspaces[0].name,
          createdAt: portfolio.workspaces[0].created_at, schemaVersion: portfolio.workspaces[0].schema_version }
      : get().workspace!;
    const projects     = (portfolio.projects     as unknown as Record<string,unknown>[]).map(mapProject);
    const versions     = (portfolio.versions     as unknown as Record<string,unknown>[]).map(mapVersion);
    const phases       = (portfolio.phases       as unknown as Record<string,unknown>[]).map(mapPhase);
    const tasks        = (portfolio.tasks        as unknown as Record<string,unknown>[]).map(mapTask);
    const dependencies = (portfolio.dependencies as unknown as Record<string,unknown>[]).map(mapDep);
    set({ workspace: ws, projects, versions, phases, tasks, dependencies, lastEditAt: Date.now() });
    get()._recompute();
  },

  // ── Workspace ─────────────────────────────────────────────────────────────
  async renameWorkspace(name) {
    const ws = get().workspace;
    if (!ws) return;
    if (!get().offline) await withAuth(() => apiPatchWorkspace(name));
    await db.workspaces.update(ws.id, { name });
    set({ workspace: { ...ws, name } });
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  async addProject(p) {
    if (!get().offline) {
      const result = await withAuth(() => apiCreateProject({
        name: p.name, description: p.description, owner: p.owner,
        status: p.status, startDate: p.startDate, endDate: p.endDate, color: p.color,
        pertO: p.pertO, pertM: p.pertM, pertP: p.pertP,
      }));
      await get().refresh();
      return result.id;
    }
    // Offline fallback
    const ws = get().workspace!;
    const order = get().projects.length;
    const id = await db.projects.add({ ...p, id: undefined as unknown as number, workspaceId: ws.id, order } as Project);
    await get()._reload(true);
    get()._recompute();
    return id;
  },

  async updateProject(id, patch) {
    if (!get().offline) {
      const snakePatch: Record<string, unknown> = {};
      if ('name' in patch)        snakePatch.name = patch.name;
      if ('description' in patch) snakePatch.description = patch.description;
      if ('owner' in patch)       snakePatch.owner = patch.owner;
      if ('status' in patch)      snakePatch.status = patch.status;
      if ('startDate' in patch)   snakePatch.startDate = patch.startDate;
      if ('endDate' in patch)     snakePatch.endDate = patch.endDate;
      if ('color' in patch)       snakePatch.color = patch.color;
      if ('order' in patch)       snakePatch.order = patch.order;
      if ('pertO' in patch)       snakePatch.pertO = patch.pertO;
      if ('pertM' in patch)       snakePatch.pertM = patch.pertM;
      if ('pertP' in patch)       snakePatch.pertP = patch.pertP;
      await withAuth(() => apiUpdateProject(id, snakePatch));
      await get().refresh();
      return;
    }
    await db.projects.update(id, patch);
    await get()._reload(true);
    get()._recompute();
  },

  async deleteProject(id) {
    if (!get().offline) {
      await withAuth(() => apiDeleteProject(id));
      await get().refresh();
      return;
    }
    await db.transaction('rw', [db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
      const phaseIds = (await db.phases.where('projectId').equals(id).toArray()).map(p => p.id);
      await db.tasks.where('phaseId').anyOf(phaseIds).delete();
      await db.phases.where('projectId').equals(id).delete();
      await db.versions.where('projectId').equals(id).delete();
      await db.dependencies.where('predecessorId').equals(id).or('successorId').equals(id).delete();
      await db.projects.delete(id);
    });
    await get()._reload(true);
    get()._recompute();
  },

  async reorderProjects(ids) {
    if (!get().offline) {
      await withAuth(() => apiReorderProjects(ids));
      await get().refresh();
      return;
    }
    await db.transaction('rw', db.projects, async () => {
      for (let i = 0; i < ids.length; i++) await db.projects.update(ids[i], { order: i });
    });
    await get()._reload(true);
  },

  // ── Versions ──────────────────────────────────────────────────────────────
  async addVersion(v) {
    if (!get().offline) {
      const result = await withAuth(() => apiCreateVersion(v.projectId, {
        label: v.label, startDate: v.startDate, endDate: v.endDate, owner: v.owner,
        pertO: v.pertO, pertM: v.pertM, pertP: v.pertP,
      }));
      await get().refresh();
      return result.id;
    }
    const order = await db.versions.where('projectId').equals(v.projectId).count();
    const id = await db.versions.add({ ...v, id: undefined as unknown as number, order } as Version);
    await get()._reload(true);
    get()._recompute();
    return id;
  },

  async updateVersion(id, patch) {
    if (!get().offline) {
      await withAuth(() => apiUpdateVersion(id, {
        label: patch.label, startDate: patch.startDate, endDate: patch.endDate,
        owner: patch.owner, order: patch.order, pertO: patch.pertO, pertM: patch.pertM, pertP: patch.pertP,
      }));
      await get().refresh();
      return;
    }
    await db.versions.update(id, patch);
    await get()._reload(true);
    get()._recompute();
  },

  async deleteVersion(id) {
    if (!get().offline) { await withAuth(() => apiDeleteVersion(id)); await get().refresh(); return; }
    const phases = await db.phases.where('versionId').equals(id).toArray();
    await db.tasks.where('phaseId').anyOf(phases.map(p => p.id)).delete();
    await db.phases.where('versionId').equals(id).delete();
    await db.versions.delete(id);
    await get()._reload(true);
    get()._recompute();
  },

  // ── Phases ────────────────────────────────────────────────────────────────
  async addPhase(p) {
    if (!get().offline) {
      const result = await withAuth(() => apiCreatePhase(p.projectId, {
        label: p.label, versionId: p.versionId, startDate: p.startDate, endDate: p.endDate,
        owner: p.owner, pertO: p.pertO, pertM: p.pertM, pertP: p.pertP,
      }));
      await get().refresh();
      return result.id;
    }
    const order = await db.phases.where('projectId').equals(p.projectId).count();
    const id = await db.phases.add({ ...p, id: undefined as unknown as number, order } as Phase);
    await get()._reload(true);
    get()._recompute();
    return id;
  },

  async updatePhase(id, patch) {
    if (!get().offline) {
      await withAuth(() => apiUpdatePhase(id, {
        label: patch.label, startDate: patch.startDate, endDate: patch.endDate,
        owner: patch.owner, versionId: patch.versionId, order: patch.order,
        pertO: patch.pertO, pertM: patch.pertM, pertP: patch.pertP,
      }));
      await get().refresh();
      return;
    }
    await db.phases.update(id, patch);
    await get()._reload(true);
    get()._recompute();
  },

  async deletePhase(id) {
    if (!get().offline) { await withAuth(() => apiDeletePhase(id)); await get().refresh(); return; }
    await db.tasks.where('phaseId').equals(id).delete();
    await db.dependencies.where('predecessorId').equals(id).or('successorId').equals(id).delete();
    await db.phases.delete(id);
    await get()._reload(true);
    get()._recompute();
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  async addTask(t) {
    if (!get().offline) {
      const result = await withAuth(() => apiCreateTask({
        phaseId: t.phaseId, name: t.name, owner: t.owner,
        optimistic: t.optimistic, mostLikely: t.mostLikely, pessimistic: t.pessimistic,
      }));
      await get().refresh();
      return result.id;
    }
    const id = await db.tasks.add({ ...t, id: undefined as unknown as number } as Task);
    await get()._reload(true);
    get()._recompute();
    return id;
  },

  async updateTask(id, patch) {
    if (!get().offline) {
      await withAuth(() => apiUpdateTask(id, {
        name: patch.name, owner: patch.owner, optimistic: patch.optimistic,
        mostLikely: patch.mostLikely, pessimistic: patch.pessimistic,
      }));
      await get().refresh();
      return;
    }
    await db.tasks.update(id, patch);
    await get()._reload(true);
    get()._recompute();
  },

  async deleteTask(id) {
    if (!get().offline) { await withAuth(() => apiDeleteTask(id)); await get().refresh(); return; }
    await db.tasks.delete(id);
    await get()._reload(true);
    get()._recompute();
  },

  // ── Dependencies ──────────────────────────────────────────────────────────
  async addDependency(predecessorId, successorId, predecessorLevel, successorLevel, type = 'FS', lagDays = 0) {
    const { projects, dependencies } = get();
    if (predecessorId === successorId) return { ok: false, cycleNames: ['Cannot depend on itself'] };
    const exists = dependencies.some(d => d.predecessorId === predecessorId && d.successorId === successorId);
    if (exists) return { ok: false, cycleNames: ['Dependency already exists'] };

    if (predecessorLevel === 'project' && successorLevel === 'project') {
      const cycle = detectCycle(
        dependencies.map(d => ({ predecessorId: d.predecessorId, successorId: d.successorId })),
        predecessorId, successorId,
      );
      if (cycle) {
        const idMap = new Map(projects.map(p => [p.id, p.name]));
        return { ok: false, cycleNames: cycle.map(id => idMap.get(id) ?? String(id)) };
      }
    }

    if (!get().offline) {
      try {
        await withAuth(() => apiCreateDependency({ predecessorId, successorId, predecessorLevel, successorLevel, type, lagDays }));
        await get().refresh();
        return { ok: true };
      } catch {
        return { ok: false, cycleNames: ['Failed to create dependency'] };
      }
    }
    await db.dependencies.add({
      id: undefined as unknown as number,
      predecessorId, successorId, predecessorLevel, successorLevel, type, lagDays,
    } as Dependency);
    await get()._reload(true);
    get()._recompute();
    return { ok: true };
  },

  async removeDependency(id) {
    if (!get().offline) { await withAuth(() => apiDeleteDependency(id)); await get().refresh(); return; }
    await db.dependencies.delete(id);
    await get()._reload(true);
    get()._recompute();
  },

  // ── Export / import ───────────────────────────────────────────────────────
  async exportJSON() {
    const json = await exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `autopilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  async importJSON(json) {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (!get().offline) {
      // Push to backend — this becomes the new source of truth for all team members
      await withAuth(() => apiImportPortfolio(data));
      await get().refresh();
      return;
    }
    // Offline: write to IndexedDB only
    await importBackup(json);
    const ws = await ensureWorkspace();
    await get()._reload(true);
    set({ workspace: ws });
    get()._recompute();
  },

  async clearAll() {
    await db.transaction('rw', [db.workspaces, db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
      await Promise.all([
        db.workspaces.clear(), db.projects.clear(), db.versions.clear(),
        db.phases.clear(), db.tasks.clear(), db.dependencies.clear(),
      ]);
    });
    const ws = await ensureWorkspace();
    set({ workspace: ws, projects: [], versions: [], phases: [], tasks: [], dependencies: [], scheduleResult: null });
  },

  // ── Internal ──────────────────────────────────────────────────────────────
  async _reload(markEdit = false) {
    const [projects, versions, phases, tasks, dependencies] = await Promise.all([
      db.projects.orderBy('order').toArray(),
      db.versions.orderBy('order').toArray(),
      db.phases.orderBy('order').toArray(),
      db.tasks.toArray(),
      db.dependencies.toArray(),
    ]);
    set({ projects, versions, phases, tasks, dependencies, ...(markEdit ? { lastEditAt: Date.now() } : {}) });
  },

  _recompute() {
    const { projects, dependencies } = get();
    const result = computePortfolioSchedule(projects, dependencies);
    const updated = projects.map(p => {
      const node = result.nodes.get(`project:${p.id}`);
      if (!node) return p;
      return { ...p, te: node.te, variance: node.variance ?? undefined, ES: node.ES, EF: node.EF, LS: node.LS, LF: node.LF, slack: node.slack, isCritical: node.isCritical, estimatePending: node.estimatePending };
    });
    set({ scheduleResult: result, projects: updated });
  },
}));

// ── Mirror server data into IndexedDB (offline cache) ────────────────────────

async function _mirrorToIndexedDB(
  ws: Workspace, projects: Project[], versions: Version[],
  phases: Phase[], tasks: Task[], dependencies: Dependency[],
) {
  await db.transaction('rw', [db.workspaces, db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
    await db.workspaces.clear();
    await db.workspaces.add(ws);
    await db.projects.clear();
    if (projects.length) await db.projects.bulkAdd(projects);
    await db.versions.clear();
    if (versions.length) await db.versions.bulkAdd(versions);
    await db.phases.clear();
    if (phases.length) await db.phases.bulkAdd(phases);
    await db.tasks.clear();
    if (tasks.length) await db.tasks.bulkAdd(tasks);
    await db.dependencies.clear();
    if (dependencies.length) await db.dependencies.bulkAdd(dependencies);
  });
}

// ── Seed data (offline/first-run fallback only) ───────────────────────────────

const PALETTE = ['#6E40C9','#1F6FEB','#238636','#9E6A03','#DA3633','#58A6FF','#3FB950','#D2A8FF','#F78166','#E3B341','#6E7681','#79C0FF','#A5D6FF'];

const SEED_PROJECTS = [
  { name: 'Truflo AI Revenue', start: '2026-06-02', end: '2026-08-31' },
  { name: 'Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items', start: '2026-05-11', end: '2026-08-31' },
  { name: 'Scrapping Framework', start: '2026-06-02', end: '2026-08-21' },
  { name: 'Rapid Onboarding - Integrations, Portal to Fact & Trending Framework', start: '2026-06-02', end: '2026-08-31' },
  { name: 'Trend scaling up - Airflow & Pyspark', start: '2026-06-02', end: '2026-08-31' },
  { name: 'Migration of Trended Data DB to - ClickHouse', start: '2026-06-02', end: '2026-08-31' },
  { name: 'Jira Workflow and Confluence process (Definition & Implementation)', start: '2026-06-02', end: '2026-08-31' },
  { name: 'Support Roster for Each team on leave plans', start: '2026-06-02', end: '2026-06-19' },
  { name: 'SOV & Discount data visualization', start: '2026-06-02', end: '2026-08-31' },
  { name: 'VAPT, ISO 27001, SOC 2', start: '2026-06-02', end: '2026-06-30' },
  { name: 'VAPT Report gap Fix and Release date', start: '2026-06-15', end: '2026-06-30' },
  { name: 'Alerting mechanism', start: '2026-06-02', end: '2026-08-31' },
  { name: 'Automation Testing', start: '2026-06-02', end: '2026-08-31' },
];

const SEED_DEPS: [string, string][] = [
  ['VAPT, ISO 27001, SOC 2', 'VAPT Report gap Fix and Release date'],
  ['VAPT Report gap Fix and Release date', 'Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items'],
  ['Automation Testing', 'Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items'],
  ['Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items', 'Truflo AI Revenue'],
  ['Scrapping Framework', 'Trend scaling up - Airflow & Pyspark'],
  ['Trend scaling up - Airflow & Pyspark', 'Migration of Trended Data DB to - ClickHouse'],
  ['SOV & Discount data visualization', 'Truflo AI Revenue'],
];

async function seedTrufloData(workspaceId: number) {
  const ids: Record<string, number> = {};
  for (let i = 0; i < SEED_PROJECTS.length; i++) {
    const sp = SEED_PROJECTS[i];
    const id = await db.projects.add({ id: undefined as unknown as number, workspaceId, name: sp.name, startDate: sp.start, endDate: sp.end, status: 'pending' as const, color: PALETTE[i % PALETTE.length], order: i } as Project);
    ids[sp.name] = id;
  }
  for (const [from, to] of SEED_DEPS) {
    if (ids[from] && ids[to]) {
      await db.dependencies.add({ id: undefined as unknown as number, predecessorId: ids[from], successorId: ids[to], predecessorLevel: 'project', successorLevel: 'project', type: 'FS', lagDays: 0 } as Dependency);
    }
  }
}
