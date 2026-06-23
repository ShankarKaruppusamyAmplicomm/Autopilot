import Dexie, { type Table } from 'dexie';
import type { Workspace, Project, Version, Phase, Task, Dependency, BackupVersion, VisitorRecord } from '../types';

export class AutopilotDB extends Dexie {
  workspaces!:     Table<Workspace>;
  projects!:       Table<Project>;
  versions!:       Table<Version>;
  phases!:         Table<Phase>;
  tasks!:          Table<Task>;
  dependencies!:   Table<Dependency>;
  backupVersions!: Table<BackupVersion>;
  visitors!:       Table<VisitorRecord>;

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
    // v3 adds visitor tracking (local-only, no external service)
    this.version(3).stores({
      workspaces:     '++id, name',
      projects:       '++id, workspaceId, name, order',
      versions:       '++id, projectId, order',
      phases:         '++id, projectId, versionId, order',
      tasks:          '++id, phaseId',
      dependencies:   '++id, predecessorId, successorId',
      backupVersions: '++id, version, createdAt',
      visitors:       '++id, deviceId, firstSeen',
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
  const entry: Omit<BackupVersion, 'id'> = { version, label, updatedBy, createdAt: new Date().toISOString(), payload };
  const id = await db.backupVersions.add(entry as BackupVersion);

  // Mirror to server best-effort
  const { createServerBackup } = await import('../api/client');
  createServerBackup(updatedBy, label, JSON.parse(payload)).catch(() => {});

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

// Shared restore helper — loads a parsed backup payload into all tables.
async function restorePayload(data: Record<string, unknown[]>): Promise<void> {
  await db.transaction('rw', [db.workspaces, db.projects, db.versions, db.phases, db.tasks, db.dependencies], async () => {
    await Promise.all([
      db.workspaces.clear(), db.projects.clear(), db.versions.clear(),
      db.phases.clear(), db.tasks.clear(), db.dependencies.clear(),
    ]);
    if (data.workspaces?.length)   await db.workspaces.bulkAdd(data.workspaces as Workspace[]);
    if (data.projects?.length)     await db.projects.bulkAdd(data.projects as Project[]);
    if (data.versions?.length)     await db.versions.bulkAdd(data.versions as Version[]);
    if (data.phases?.length)       await db.phases.bulkAdd(data.phases as Phase[]);
    if (data.tasks?.length)        await db.tasks.bulkAdd(data.tasks as Task[]);
    if (data.dependencies?.length) await db.dependencies.bulkAdd(data.dependencies as Dependency[]);
  });
}

// Restore projects/deps/versions/phases/tasks from the latest IndexedDB backup.
// Called on boot when projects table is empty but backups exist — survives deploys.
export async function restoreFromLatestBackup(): Promise<boolean> {
  const latest = await db.backupVersions.orderBy('createdAt').last();
  if (!latest) return false;
  try {
    const data = JSON.parse(latest.payload);
    await restorePayload(data);
    return true;
  } catch {
    return false;
  }
}

// restoreFromStaticSeed removed — server API (/api/v1/portfolio) is now the
// primary source of truth. IndexedDB is only an offline cache written by the store.

// Publish the current state — downloads seed.json locally and optionally
// pushes to the backend API as the canonical seed.
export async function publishSeedFile(adminPassword?: string): Promise<{ serverOk: boolean; error?: string }> {
  const json = await snapshot();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'seed.json';
  a.click();
  URL.revokeObjectURL(a.href);

  if (adminPassword) {
    const { publishSeedToServer } = await import('../api/client');
    const result = await publishSeedToServer(JSON.parse(json), adminPassword);
    return { serverOk: result.ok, error: result.error };
  }
  return { serverOk: false };
}

// ─── Visitor tracking (local-only) ───────────────────────────────────────────

function getOrCreateDeviceId(): string {
  const KEY = 'autopilot_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export async function recordVisit(): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = navigator.language;

  // Local IndexedDB
  const existing = await db.visitors.where('deviceId').equals(deviceId).first();
  const now = new Date().toISOString();
  if (!existing) {
    await db.visitors.add({
      id: undefined as unknown as number,
      deviceId, firstSeen: now, lastSeen: now, visitCount: 1, timezone, locale,
    } as VisitorRecord);
  } else {
    await db.visitors.update(existing.id, { lastSeen: now, visitCount: (existing.visitCount ?? 1) + 1 });
  }

  // Mirror to server (best-effort, non-blocking)
  const { recordVisitServer } = await import('../api/client');
  recordVisitServer(deviceId, timezone, locale).catch(() => {});
}

export async function listVisitors(): Promise<VisitorRecord[]> {
  // Try server first (has cross-browser data), fall back to local
  try {
    const { fetchServerVisitors } = await import('../api/client');
    const serverVisitors = await fetchServerVisitors();
    if (serverVisitors.length > 0) {
      return serverVisitors.map(v => ({
        id: v.id,
        deviceId: v.device_id,
        firstSeen: v.first_seen,
        lastSeen: v.last_seen,
        visitCount: v.visit_count,
        timezone: v.timezone,
        locale: v.locale,
      }));
    }
  } catch { /* fall through */ }
  return db.visitors.orderBy('firstSeen').reverse().toArray();
}

// ─── Legacy full export / import ─────────────────────────────────────────────

export async function exportBackup(): Promise<string> {
  return snapshot();
}

export async function importBackup(json: string): Promise<void> {
  const data = JSON.parse(json);
  await restorePayload(data);
}
