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

// Module-level flag — survives StrictMode double-invoke within the same JS module instance
let _initStarted = false;

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
    if (_initStarted) return;
    _initStarted = true;

    const SEED_VERSION = 5;

    // Deduplicate workspaces — keep only the first, delete the rest
    const allWs = await db.workspaces.toArray();
    if (allWs.length > 1) {
      const extras = allWs.slice(1).map(w => w.id);
      await db.workspaces.bulkDelete(extras);
    }
    let ws = allWs[0] ?? await db.workspaces.get(
      await db.workspaces.add({ id: undefined as unknown as number, name: 'Truflo AI', createdAt: new Date().toISOString(), schemaVersion: 0 })
    ) as typeof allWs[0];

    const needsReseed = (ws.schemaVersion ?? 0) < SEED_VERSION;
    if (needsReseed) {
      // Wipe everything and re-seed cleanly
      await db.transaction('rw', [db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
        await Promise.all([
          db.projects.clear(), db.versions.clear(),
          db.phases.clear(), db.tasks.clear(), db.dependencies.clear(),
        ]);
      });
      await seedTrufloData(ws.id as number);
      await db.workspaces.update(ws.id, { schemaVersion: SEED_VERSION });
      ws = { ...ws, schemaVersion: SEED_VERSION };
    }

    await get()._reload();
    set({ workspace: ws, loading: false });
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

const PALETTE = [
  '#6E40C9','#1F6FEB','#238636','#9E6A03','#DA3633',
  '#58A6FF','#3FB950','#D2A8FF','#F78166','#E3B341',
  '#6E7681','#79C0FF','#A5D6FF',
];

// Exact project list from the Truflo AI planning sheet.
// No PERT estimates — scheduler uses date span and marks EST?.
// No owners or status — user fills those in via the editor.
const SEED_PROJECTS: Array<{ name: string; start: string; end: string }> = [
  { name: 'Truflo AI Revenue',
    start: '2026-06-02', end: '2026-08-31' },

  { name: 'Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items',
    start: '2026-05-11', end: '2026-08-31' },

  { name: 'Scrapping Framework',
    start: '2026-06-02', end: '2026-08-21' },

  { name: 'Rapid Onboarding - Integrations, Portal to Fact & Trending Framework',
    start: '2026-06-02', end: '2026-08-31' },

  { name: 'Trend scaling up - Airflow & Pyspark',
    start: '2026-06-02', end: '2026-08-31' },

  { name: 'Migration of Trended Data DB to - ClickHouse',
    start: '2026-06-02', end: '2026-08-31' },

  { name: 'Jira Workflow and Confluence process (Definition & Implementation)',
    start: '2026-06-02', end: '2026-08-31' },

  { name: 'Support Roster for Each team on leave plans',
    start: '2026-06-02', end: '2026-06-19' },

  { name: 'SOV & Discount data visualization',
    start: '2026-06-02', end: '2026-08-31' },

  { name: 'VAPT, ISO 27001, SOC 2',
    start: '2026-06-02', end: '2026-06-30' },

  { name: 'VAPT Report gap Fix and Release date',
    start: '2026-06-15', end: '2026-06-30' },

  { name: 'Alerting mechanism',
    start: '2026-06-02', end: '2026-08-31' },

  { name: 'Automation Testing',
    start: '2026-06-02', end: '2026-08-31' },
];

const SEED_DEPS: [string, string][] = [
  ['VAPT, ISO 27001, SOC 2', 'VAPT Report gap Fix and Release date'],
  ['VAPT Report gap Fix and Release date',
   'Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items'],
  ['Automation Testing',
   'Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items'],
  ['Truflo AI (Scale up, QA Automation, NLP Accuracy) / Product Readiness and Launch Action items',
   'Truflo AI Revenue'],
  ['Scrapping Framework', 'Trend scaling up - Airflow & Pyspark'],
  ['Trend scaling up - Airflow & Pyspark', 'Migration of Trended Data DB to - ClickHouse'],
  ['SOV & Discount data visualization', 'Truflo AI Revenue'],
];

async function seedTrufloData(workspaceId: number) {
  const ids: Record<string, number> = {};
  for (let i = 0; i < SEED_PROJECTS.length; i++) {
    const sp = SEED_PROJECTS[i];
    const id = await db.projects.add({
      id: undefined as unknown as number,
      workspaceId,
      name: sp.name,
      startDate: sp.start,
      endDate: sp.end,
      status: 'pending' as const,
      color: PALETTE[i % PALETTE.length],
      order: i,
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
