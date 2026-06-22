import Dexie, { type Table } from 'dexie';
import type { Workspace, Project, Version, Phase, Task, Dependency } from '../types';

export class AutopilotDB extends Dexie {
  workspaces!: Table<Workspace>;
  projects!: Table<Project>;
  versions!: Table<Version>;
  phases!: Table<Phase>;
  tasks!: Table<Task>;
  dependencies!: Table<Dependency>;

  constructor() {
    super('AutopilotDB');
    this.version(1).stores({
      workspaces: '++id, name',
      projects:   '++id, workspaceId, name, order',
      versions:   '++id, projectId, order',
      phases:     '++id, projectId, versionId, order',
      tasks:      '++id, phaseId',
      dependencies: '++id, predecessorId, successorId',
    });
  }
}

export const db = new AutopilotDB();

export async function ensureWorkspace(): Promise<Workspace> {
  const existing = await db.workspaces.toArray();
  if (existing.length > 0) return existing[0];
  const id = await db.workspaces.add({
    id: undefined as unknown as number,
    name: 'Truflo AI',
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  });
  return db.workspaces.get(id) as Promise<Workspace>;
}

export async function exportBackup(): Promise<string> {
  const [workspaces, projects, versions, phases, tasks, dependencies] = await Promise.all([
    db.workspaces.toArray(),
    db.projects.toArray(),
    db.versions.toArray(),
    db.phases.toArray(),
    db.tasks.toArray(),
    db.dependencies.toArray(),
  ]);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    workspaces, projects, versions, phases, tasks, dependencies,
  }, null, 2);
}

export async function importBackup(json: string): Promise<void> {
  const data = JSON.parse(json);
  await db.transaction('rw', [db.workspaces, db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
    await Promise.all([
      db.workspaces.clear(), db.projects.clear(), db.versions.clear(),
      db.phases.clear(), db.tasks.clear(), db.dependencies.clear(),
    ]);
    if (data.workspaces?.length) await db.workspaces.bulkAdd(data.workspaces);
    if (data.projects?.length) await db.projects.bulkAdd(data.projects);
    if (data.versions?.length) await db.versions.bulkAdd(data.versions);
    if (data.phases?.length) await db.phases.bulkAdd(data.phases);
    if (data.tasks?.length) await db.tasks.bulkAdd(data.tasks);
    if (data.dependencies?.length) await db.dependencies.bulkAdd(data.dependencies);
  });
}
