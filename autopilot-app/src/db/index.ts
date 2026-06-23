import Dexie, { type Table } from 'dexie';
import type { Workspace, Project, Version, Phase, Task, Dependency, BackupVersion } from '../types';

export class AutopilotDB extends Dexie {
  workspaces!:     Table<Workspace>;
  projects!:       Table<Project>;
  versions!:       Table<Version>;
  phases!:         Table<Phase>;
  tasks!:          Table<Task>;
  dependencies!:   Table<Dependency>;
  backupVersions!: Table<BackupVersion>;

  constructor() {
    super('AutopilotDB');
    this.version(1).stores({
      workspaces:   '++id, name',
      projects:     '++id, workspaceId, name, order',
      versions:     '++id, projectId, order',
      phases:       '++id, projectId, versionId, order',
      tasks:        '++id, phaseId',
      dependencies: '++id, predecessorId, successorId',
    });
    // v2 adds versioned backup history
    this.version(2).stores({
      workspaces:     '++id, name',
      projects:       '++id, workspaceId, name, order',
      versions:       '++id, projectId, order',
      phases:         '++id, projectId, versionId, order',
      tasks:          '++id, phaseId',
      dependencies:   '++id, predecessorId, successorId',
      backupVersions: '++id, version, createdAt',
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

// ─── Snapshot helpers ────────────────────────────────────────────────────────

async function snapshot(): Promise<string> {
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

// ─── Versioned backup (stored in IndexedDB) ──────────────────────────────────

export async function listBackupVersions(): Promise<BackupVersion[]> {
  return db.backupVersions.orderBy('createdAt').reverse().toArray();
}

export async function createBackupVersion(updatedBy: string, label: string): Promise<BackupVersion> {
  const count = await db.backupVersions.count();
  const version = `V${count + 1}`;
  const payload = await snapshot();
  const entry: Omit<BackupVersion, 'id'> = {
    version,
    label,
    updatedBy,
    createdAt: new Date().toISOString(),
    payload,
  };
  const id = await db.backupVersions.add(entry as BackupVersion);
  return { ...entry, id } as BackupVersion;
}

export async function downloadBackupVersion(bv: BackupVersion): Promise<void> {
  const blob = new Blob([bv.payload], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `autopilot-${bv.version}-${bv.createdAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function deleteBackupVersion(id: number): Promise<void> {
  await db.backupVersions.delete(id);
}

// ─── Legacy full export / import ─────────────────────────────────────────────

export async function exportBackup(): Promise<string> {
  return snapshot();
}

export async function importBackup(json: string): Promise<void> {
  const data = JSON.parse(json);
  await db.transaction('rw', [db.workspaces, db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
    await Promise.all([
      db.workspaces.clear(), db.projects.clear(), db.versions.clear(),
      db.phases.clear(), db.tasks.clear(), db.dependencies.clear(),
    ]);
    if (data.workspaces?.length)   await db.workspaces.bulkAdd(data.workspaces);
    if (data.projects?.length)     await db.projects.bulkAdd(data.projects);
    if (data.versions?.length)     await db.versions.bulkAdd(data.versions);
    if (data.phases?.length)       await db.phases.bulkAdd(data.phases);
    if (data.tasks?.length)        await db.tasks.bulkAdd(data.tasks);
    if (data.dependencies?.length) await db.dependencies.bulkAdd(data.dependencies);
  });
}
