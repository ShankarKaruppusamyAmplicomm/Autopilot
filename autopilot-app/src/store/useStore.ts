import { create } from 'zustand';
import { db, ensureWorkspace, exportBackup, importBackup } from '../db';
import { computePortfolioSchedule, detectCycle } from '../engine/scheduler';
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

  // Init
  init: () => Promise<void>;

  // Workspace
  renameWorkspace: (name: string) => Promise<void>;

  // Projects
  addProject: (p: Omit<Project, 'id' | 'workspaceId' | 'order'>) => Promise<number>;
  updateProject: (id: number, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  reorderProjects: (ids: number[]) => Promise<void>;

  // Versions
  addVersion: (v: Omit<Version, 'id' | 'order'>) => Promise<number>;
  updateVersion: (id: number, patch: Partial<Version>) => Promise<void>;
  deleteVersion: (id: number) => Promise<void>;

  // Phases
  addPhase: (p: Omit<Phase, 'id' | 'order'>) => Promise<number>;
  updatePhase: (id: number, patch: Partial<Phase>) => Promise<void>;
  deletePhase: (id: number) => Promise<void>;

  // Tasks
  addTask: (t: Omit<Task, 'id'>) => Promise<number>;
  updateTask: (id: number, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;

  // Dependencies
  addDependency: (
    predecessorId: number, successorId: number,
    predecessorLevel: ItemLevel, successorLevel: ItemLevel,
    type?: Dependency['type'], lagDays?: number
  ) => Promise<{ ok: boolean; cycleNames?: string[] }>;
  removeDependency: (id: number) => Promise<void>;

  // Export/import
  exportJSON: () => Promise<void>;
  importJSON: (json: string) => Promise<void>;
  clearAll: () => Promise<void>;

  // Internal
  _reload: () => Promise<void>;
  _recompute: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  workspace: null,
  projects: [],
  versions: [],
  phases: [],
  tasks: [],
  dependencies: [],
  scheduleResult: null,
  loading: true,

  async init() {
    const ws = await ensureWorkspace();
    await get()._reload();
    set({ workspace: ws, loading: false });
    // Seed Truflo AI data if empty
    if (get().projects.length === 0) {
      await seedTrufloData(get, ws.id);
      await get()._reload();
    }
    get()._recompute();
  },

  async renameWorkspace(name) {
    const ws = get().workspace;
    if (!ws) return;
    await db.workspaces.update(ws.id, { name });
    set({ workspace: { ...ws, name } });
  },

  async addProject(p) {
    const ws = get().workspace!;
    const order = get().projects.length;
    const id = await db.projects.add({ ...p, id: undefined as unknown as number, workspaceId: ws.id, order } as Project);
    await get()._reload();
    get()._recompute();
    return id;
  },

  async updateProject(id, patch) {
    await db.projects.update(id, patch);
    await get()._reload();
    get()._recompute();
  },

  async deleteProject(id) {
    await db.transaction('rw', [db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
      const versionIds = (await db.versions.where('projectId').equals(id).toArray()).map(v => v.id);
      const phaseIds = (await db.phases.where('projectId').equals(id).toArray()).map(p => p.id);
      await db.tasks.where('phaseId').anyOf(phaseIds).delete();
      await db.phases.where('projectId').equals(id).delete();
      await db.versions.where('projectId').equals(id).delete();
      await db.dependencies.where('predecessorId').equals(id).or('successorId').equals(id).delete();
      await db.projects.delete(id);
    });
    await get()._reload();
    get()._recompute();
  },

  async reorderProjects(ids) {
    await db.transaction('rw', db.projects, async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.projects.update(ids[i], { order: i });
      }
    });
    await get()._reload();
  },

  async addVersion(v) {
    const order = (await db.versions.where('projectId').equals(v.projectId).count());
    const id = await db.versions.add({ ...v, id: undefined as unknown as number, order } as Version);
    await get()._reload();
    get()._recompute();
    return id;
  },

  async updateVersion(id, patch) {
    await db.versions.update(id, patch);
    await get()._reload();
    get()._recompute();
  },

  async deleteVersion(id) {
    const phases = await db.phases.where('versionId').equals(id).toArray();
    const phaseIds = phases.map(p => p.id);
    await db.tasks.where('phaseId').anyOf(phaseIds).delete();
    await db.phases.where('versionId').equals(id).delete();
    await db.versions.delete(id);
    await get()._reload();
    get()._recompute();
  },

  async addPhase(p) {
    const order = (await db.phases.where('projectId').equals(p.projectId).count());
    const id = await db.phases.add({ ...p, id: undefined as unknown as number, order } as Phase);
    await get()._reload();
    get()._recompute();
    return id;
  },

  async updatePhase(id, patch) {
    await db.phases.update(id, patch);
    await get()._reload();
    get()._recompute();
  },

  async deletePhase(id) {
    await db.tasks.where('phaseId').equals(id).delete();
    await db.dependencies.where('predecessorId').equals(id).or('successorId').equals(id).delete();
    await db.phases.delete(id);
    await get()._reload();
    get()._recompute();
  },

  async addTask(t) {
    const id = await db.tasks.add({ ...t, id: undefined as unknown as number } as Task);
    await get()._reload();
    get()._recompute();
    return id;
  },

  async updateTask(id, patch) {
    await db.tasks.update(id, patch);
    await get()._reload();
    get()._recompute();
  },

  async deleteTask(id) {
    await db.tasks.delete(id);
    await get()._reload();
    get()._recompute();
  },

  async addDependency(predecessorId, successorId, predecessorLevel, successorLevel, type = 'FS', lagDays = 0) {
    const { projects, dependencies } = get();
    if (predecessorId === successorId) return { ok: false, cycleNames: ['Cannot depend on itself'] };

    const exists = dependencies.some(d => d.predecessorId === predecessorId && d.successorId === successorId);
    if (exists) return { ok: false, cycleNames: ['Dependency already exists'] };

    // Only check cycles for project-level (same-level) for now
    if (predecessorLevel === 'project' && successorLevel === 'project') {
      const cycle = detectCycle(
        dependencies.map(d => ({ predecessorId: d.predecessorId, successorId: d.successorId })),
        predecessorId,
        successorId,
      );
      if (cycle) {
        const idMap = new Map(projects.map(p => [p.id, p.name]));
        return { ok: false, cycleNames: cycle.map(id => idMap.get(id) ?? String(id)) };
      }
    }

    await db.dependencies.add({
      id: undefined as unknown as number,
      predecessorId, successorId, predecessorLevel, successorLevel, type, lagDays,
    } as Dependency);
    await get()._reload();
    get()._recompute();
    return { ok: true };
  },

  async removeDependency(id) {
    await db.dependencies.delete(id);
    await get()._reload();
    get()._recompute();
  },

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
    await importBackup(json);
    const ws = await ensureWorkspace();
    await get()._reload();
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

  async _reload() {
    const [projects, versions, phases, tasks, dependencies] = await Promise.all([
      db.projects.orderBy('order').toArray(),
      db.versions.orderBy('order').toArray(),
      db.phases.orderBy('order').toArray(),
      db.tasks.toArray(),
      db.dependencies.toArray(),
    ]);
    set({ projects, versions, phases, tasks, dependencies });
  },

  _recompute() {
    const { projects, dependencies } = get();
    const result = computePortfolioSchedule(projects, dependencies);
    // Push computed fields back onto project objects in state (not DB — derived)
    const updated = projects.map(p => {
      const node = result.nodes.get(`project:${p.id}`);
      if (!node) return p;
      return { ...p, te: node.te, variance: node.variance ?? undefined, ES: node.ES, EF: node.EF, LS: node.LS, LF: node.LF, slack: node.slack, isCritical: node.isCritical, estimatePending: node.estimatePending };
    });
    set({ scheduleResult: result, projects: updated });
  },
}));

// ─── SEED DATA ───────────────────────────────────────────────────────────────

const PALETTE = ['#6E40C9','#1F6FEB','#238636','#9E6A03','#DA3633','#58A6FF','#3FB950','#D2A8FF','#F78166','#E3B341','#6E7681','#79C0FF','#A5D6FF','#56D364','#FF7B72','#FFA657','#D29922','#BC8CFF','#30363D'];

const SEED_PROJECTS = [
  { name: 'Scraping Framework',           owner: 'Saurav',   start: '2026-01-06', end: '2026-03-28', o: 8,  m: 12, p: 18, status: 'on-track' as const },
  { name: 'Trend Scaling (Airflow)',       owner: 'Saurav',   start: '2026-02-03', end: '2026-04-17', o: 6,  m: 10, p: 16, status: 'on-track' as const },
  { name: 'Trend Scaling (PySpark)',       owner: 'Saurav',   start: '2026-02-17', end: '2026-05-01', o: 6,  m: 10, p: 16, status: 'at-risk'  as const },
  { name: 'ClickHouse Migration',          owner: 'Saurav',   start: '2026-01-20', end: '2026-04-03', o: 8,  m: 12, p: 20, status: 'on-track' as const },
  { name: 'SOV & Discount Visualisation', owner: 'Puneet',   start: '2026-02-10', end: '2026-04-24', o: 4,  m: 7,  p: 12, status: 'on-track' as const },
  { name: 'DAAS Platform',                owner: 'Puneet',   start: '2026-03-03', end: '2026-05-29', o: 6,  m: 10, p: 16, status: 'pending'  as const },
  { name: 'VAPT / ISO 27001 / SOC 2',    owner: 'Achin',    start: '2026-01-06', end: '2026-02-27', o: 4,  m: 7,  p: 10, status: 'on-track' as const },
  { name: 'VAPT Gap-Fix & Release',       owner: 'Achin',    start: '2026-02-24', end: '2026-04-03', o: 3,  m: 5,  p: 8,  status: 'at-risk'  as const },
  { name: 'Automation Testing',           owner: 'Saurav',   start: '2026-01-06', end: '2026-03-06', o: 4,  m: 7,  p: 10, status: 'on-track' as const },
  { name: 'Performance Testing',          owner: 'Saurav',   start: '2026-03-03', end: '2026-04-03', o: 3,  m: 5,  p: 8,  status: 'pending'  as const },
  { name: 'Product Readiness & Launch',   owner: 'Puneet',   start: '2026-04-07', end: '2026-05-15', o: 4,  m: 6,  p: 10, status: 'pending'  as const },
  { name: 'Truflo AI Revenue',            owner: 'Shankar',  start: '2026-05-19', end: '2026-06-26', o: 3,  m: 5,  p: 8,  status: 'pending'  as const },
  { name: 'Mobile App MVP',               owner: 'Puneet',   start: '2026-02-17', end: '2026-05-15', o: 8,  m: 12, p: 20, status: 'at-risk'  as const },
  { name: 'API Gateway v2',               owner: 'Saurav',   start: '2026-01-20', end: '2026-03-13', o: 4,  m: 6,  p: 10, status: 'on-track' as const },
  { name: 'Data Quality Framework',       owner: 'Saurav',   start: '2026-02-03', end: '2026-04-10', o: 4,  m: 7,  p: 12, status: 'on-track' as const },
  { name: 'Customer Portal',              owner: 'Puneet',   start: '2026-03-17', end: '2026-05-22', o: 5,  m: 8,  p: 14, status: 'pending'  as const },
  { name: 'Infrastructure Hardening',     owner: 'Achin',    start: '2026-01-13', end: '2026-03-06', o: 4,  m: 6,  p: 9,  status: 'on-track' as const },
  { name: 'Analytics Dashboard',          owner: 'Puneet',   start: '2026-02-24', end: '2026-04-17', o: 4,  m: 6,  p: 10, status: 'on-track' as const },
  { name: 'Compliance Reporting',         owner: 'Achin',    start: '2026-03-31', end: '2026-05-08', o: 3,  m: 5,  p: 8,  status: 'pending'  as const },
];

const SEED_DEPS = [
  ['Automation Testing', 'Performance Testing'],
  ['Performance Testing', 'VAPT Gap-Fix & Release'],
  ['VAPT / ISO 27001 / SOC 2', 'VAPT Gap-Fix & Release'],
  ['VAPT Gap-Fix & Release', 'Product Readiness & Launch'],
  ['DAAS Platform', 'Product Readiness & Launch'],
  ['Product Readiness & Launch', 'Truflo AI Revenue'],
  ['Scraping Framework', 'Trend Scaling (Airflow)'],
  ['Trend Scaling (Airflow)', 'Trend Scaling (PySpark)'],
  ['ClickHouse Migration', 'DAAS Platform'],
  ['API Gateway v2', 'Customer Portal'],
  ['Infrastructure Hardening', 'API Gateway v2'],
  ['VAPT Gap-Fix & Release', 'Compliance Reporting'],
  ['Data Quality Framework', 'Analytics Dashboard'],
];

async function seedTrufloData(
  get: () => AppState,
  workspaceId: number,
) {
  const ids: Record<string, number> = {};
  for (let i = 0; i < SEED_PROJECTS.length; i++) {
    const sp = SEED_PROJECTS[i];
    const id = await db.projects.add({
      id: undefined as unknown as number,
      workspaceId,
      name: sp.name,
      owner: sp.owner,
      startDate: sp.start,
      endDate: sp.end,
      status: sp.status,
      color: PALETTE[i % PALETTE.length],
      order: i,
      pertO: sp.o,
      pertM: sp.m,
      pertP: sp.p,
    } as Project);
    ids[sp.name] = id;
  }
  for (const [from, to] of SEED_DEPS) {
    if (ids[from] && ids[to]) {
      await db.dependencies.add({
        id: undefined as unknown as number,
        predecessorId: ids[from],
        successorId: ids[to],
        predecessorLevel: 'project',
        successorLevel: 'project',
        type: 'FS',
        lagDays: 0,
      } as Dependency);
    }
  }
}
