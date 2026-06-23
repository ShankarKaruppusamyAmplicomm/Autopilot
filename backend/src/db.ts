// Typed D1 / SQLite query layer for all portfolio entities.

export type D1Env = { DB: D1Database };

// ── Row types (snake_case, as returned by SQL) ────────────────────────────────

export interface WorkspaceRow {
  id: number;
  name: string;
  created_at: string;
  schema_version: number;
}

export interface ProjectRow {
  id: number;
  workspace_id: number;
  name: string;
  description: string | null;
  owner: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  color: string;
  sort_order: number;
  pert_o: number | null;
  pert_m: number | null;
  pert_p: number | null;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  id: number;
  project_id: number;
  label: string;
  start_date: string | null;
  end_date: string | null;
  owner: string | null;
  sort_order: number;
  pert_o: number | null;
  pert_m: number | null;
  pert_p: number | null;
  created_at: string;
  updated_at: string;
}

export interface PhaseRow {
  id: number;
  project_id: number;
  version_id: number | null;
  label: string;
  start_date: string | null;
  end_date: string | null;
  owner: string | null;
  sort_order: number;
  pert_o: number | null;
  pert_m: number | null;
  pert_p: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: number;
  phase_id: number;
  name: string;
  owner: string | null;
  optimistic: number | null;
  most_likely: number | null;
  pessimistic: number | null;
  created_at: string;
  updated_at: string;
}

export interface DependencyRow {
  id: number;
  predecessor_id: number;
  successor_id: number;
  predecessor_level: string;
  successor_level: string;
  type: string;
  lag_days: number;
  created_at: string;
}

export interface ActivityRow {
  id: number;
  actor: string;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  action: string;
  diff_json: string | null;
  created_at: string;
}

// Legacy
export interface Snapshot { id: number; payload: string; created_at: string; }
export interface Backup { id: number; version: string; label: string; updated_by: string; created_at: string; payload: string; }
export interface Visitor { id: number; device_id: string; first_seen: string; last_seen: string; visit_count: number; timezone: string; locale: string; }

// ── Portfolio ─────────────────────────────────────────────────────────────────

export async function getPortfolio(db: D1Database): Promise<{
  workspaces: WorkspaceRow[];
  projects: ProjectRow[];
  versions: VersionRow[];
  phases: PhaseRow[];
  tasks: TaskRow[];
  dependencies: DependencyRow[];
}> {
  const [ws, projects, versions, phases, tasks, deps] = await Promise.all([
    db.prepare('SELECT * FROM workspaces LIMIT 1').all<WorkspaceRow>(),
    db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, id ASC').all<ProjectRow>(),
    db.prepare('SELECT * FROM versions ORDER BY sort_order ASC, id ASC').all<VersionRow>(),
    db.prepare('SELECT * FROM phases ORDER BY sort_order ASC, id ASC').all<PhaseRow>(),
    db.prepare('SELECT * FROM tasks ORDER BY id ASC').all<TaskRow>(),
    db.prepare('SELECT * FROM dependencies ORDER BY id ASC').all<DependencyRow>(),
  ]);
  return {
    workspaces: ws.results,
    projects: projects.results,
    versions: versions.results,
    phases: phases.results,
    tasks: tasks.results,
    dependencies: deps.results,
  };
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export async function ensureWorkspaceRow(db: D1Database): Promise<WorkspaceRow> {
  const existing = await db.prepare('SELECT * FROM workspaces LIMIT 1').first<WorkspaceRow>();
  if (existing) return existing;
  await db.prepare("INSERT INTO workspaces (name, schema_version) VALUES ('Truflo AI', 1)").run();
  return db.prepare('SELECT * FROM workspaces LIMIT 1').first<WorkspaceRow>() as Promise<WorkspaceRow>;
}

export async function updateWorkspace(db: D1Database, id: number, name: string): Promise<void> {
  await db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').bind(name, id).run();
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(db: D1Database): Promise<ProjectRow[]> {
  return (await db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, id ASC').all<ProjectRow>()).results;
}

export async function getProject(db: D1Database, id: number): Promise<ProjectRow | null> {
  return db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<ProjectRow>();
}

export async function createProject(db: D1Database, data: Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.prepare(`
    INSERT INTO projects (workspace_id, name, description, owner, status, start_date, end_date, color, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).bind(
    data.workspace_id, data.name, data.description ?? null, data.owner ?? null,
    data.status, data.start_date ?? null, data.end_date ?? null, data.color,
    data.sort_order, data.pert_o ?? null, data.pert_m ?? null, data.pert_p ?? null, now, now,
  ).first<{ id: number }>();
  return r!.id;
}

export async function updateProject(db: D1Database, id: number, data: Partial<ProjectRow>): Promise<void> {
  const now = new Date().toISOString();
  const fields = ['name','description','owner','status','start_date','end_date','color','sort_order','pert_o','pert_m','pert_p'];
  const updates = fields.filter(f => f in data).map(f => `${f} = ?`);
  if (!updates.length) return;
  updates.push('updated_at = ?');
  const vals = fields.filter(f => f in data).map(f => (data as Record<string,unknown>)[f] ?? null);
  vals.push(now, id);
  await db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
}

export async function deleteProject(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM dependencies WHERE predecessor_id = ? AND predecessor_level = "project"').bind(id).run();
  await db.prepare('DELETE FROM dependencies WHERE successor_id = ? AND successor_level = "project"').bind(id).run();
  await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
}

export async function reorderProjects(db: D1Database, ids: number[]): Promise<void> {
  const stmts = ids.map((id, i) => db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?').bind(i, id));
  await db.batch(stmts);
}

// ── Versions ──────────────────────────────────────────────────────────────────

export async function listVersions(db: D1Database, projectId: number): Promise<VersionRow[]> {
  return (await db.prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY sort_order ASC, id ASC').bind(projectId).all<VersionRow>()).results;
}

export async function createVersion(db: D1Database, data: Omit<VersionRow, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.prepare(`
    INSERT INTO versions (project_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).bind(
    data.project_id, data.label, data.start_date ?? null, data.end_date ?? null,
    data.owner ?? null, data.sort_order, data.pert_o ?? null, data.pert_m ?? null, data.pert_p ?? null, now, now,
  ).first<{ id: number }>();
  return r!.id;
}

export async function updateVersion(db: D1Database, id: number, data: Partial<VersionRow>): Promise<void> {
  const now = new Date().toISOString();
  const fields = ['label','start_date','end_date','owner','sort_order','pert_o','pert_m','pert_p'];
  const updates = fields.filter(f => f in data).map(f => `${f} = ?`);
  if (!updates.length) return;
  updates.push('updated_at = ?');
  const vals = fields.filter(f => f in data).map(f => (data as Record<string,unknown>)[f] ?? null);
  vals.push(now, id);
  await db.prepare(`UPDATE versions SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
}

export async function deleteVersion(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM versions WHERE id = ?').bind(id).run();
}

// ── Phases ────────────────────────────────────────────────────────────────────

export async function listPhases(db: D1Database, projectId: number): Promise<PhaseRow[]> {
  return (await db.prepare('SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order ASC, id ASC').bind(projectId).all<PhaseRow>()).results;
}

export async function createPhase(db: D1Database, data: Omit<PhaseRow, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.prepare(`
    INSERT INTO phases (project_id, version_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).bind(
    data.project_id, data.version_id ?? null, data.label,
    data.start_date ?? null, data.end_date ?? null, data.owner ?? null,
    data.sort_order, data.pert_o ?? null, data.pert_m ?? null, data.pert_p ?? null, now, now,
  ).first<{ id: number }>();
  return r!.id;
}

export async function updatePhase(db: D1Database, id: number, data: Partial<PhaseRow>): Promise<void> {
  const now = new Date().toISOString();
  const fields = ['label','start_date','end_date','owner','sort_order','version_id','pert_o','pert_m','pert_p'];
  const updates = fields.filter(f => f in data).map(f => `${f} = ?`);
  if (!updates.length) return;
  updates.push('updated_at = ?');
  const vals = fields.filter(f => f in data).map(f => (data as Record<string,unknown>)[f] ?? null);
  vals.push(now, id);
  await db.prepare(`UPDATE phases SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
}

export async function deletePhase(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM dependencies WHERE predecessor_id = ? AND predecessor_level = "phase"').bind(id).run();
  await db.prepare('DELETE FROM dependencies WHERE successor_id = ? AND successor_level = "phase"').bind(id).run();
  await db.prepare('DELETE FROM phases WHERE id = ?').bind(id).run();
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function listTasks(db: D1Database, phaseId: number): Promise<TaskRow[]> {
  return (await db.prepare('SELECT * FROM tasks WHERE phase_id = ? ORDER BY id ASC').bind(phaseId).all<TaskRow>()).results;
}

export async function createTask(db: D1Database, data: Omit<TaskRow, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.prepare(`
    INSERT INTO tasks (phase_id, name, owner, optimistic, most_likely, pessimistic, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).bind(
    data.phase_id, data.name, data.owner ?? null,
    data.optimistic ?? null, data.most_likely ?? null, data.pessimistic ?? null, now, now,
  ).first<{ id: number }>();
  return r!.id;
}

export async function updateTask(db: D1Database, id: number, data: Partial<TaskRow>): Promise<void> {
  const now = new Date().toISOString();
  const fields = ['name','owner','optimistic','most_likely','pessimistic'];
  const updates = fields.filter(f => f in data).map(f => `${f} = ?`);
  if (!updates.length) return;
  updates.push('updated_at = ?');
  const vals = fields.filter(f => f in data).map(f => (data as Record<string,unknown>)[f] ?? null);
  vals.push(now, id);
  await db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
}

export async function deleteTask(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
}

// ── Dependencies ──────────────────────────────────────────────────────────────

export async function listDependencies(db: D1Database): Promise<DependencyRow[]> {
  return (await db.prepare('SELECT * FROM dependencies ORDER BY id ASC').all<DependencyRow>()).results;
}

export async function createDependency(db: D1Database, data: Omit<DependencyRow, 'id' | 'created_at'>): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.prepare(`
    INSERT OR IGNORE INTO dependencies (predecessor_id, successor_id, predecessor_level, successor_level, type, lag_days, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).bind(
    data.predecessor_id, data.successor_id, data.predecessor_level,
    data.successor_level, data.type, data.lag_days, now,
  ).first<{ id: number }>();
  return r?.id ?? 0;
}

export async function deleteDependency(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM dependencies WHERE id = ?').bind(id).run();
}

// ── Activity log ──────────────────────────────────────────────────────────────

export async function logActivity(
  db: D1Database,
  actor: string,
  entityType: string,
  entityId: number | null,
  entityName: string | null,
  action: string,
  diff: Record<string, unknown> | null,
): Promise<void> {
  await db.prepare(`
    INSERT INTO activity_log (actor, entity_type, entity_id, entity_name, action, diff_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(actor, entityType, entityId, entityName, action, diff ? JSON.stringify(diff) : null, new Date().toISOString()).run();
}

export async function listActivity(db: D1Database, limit = 100): Promise<ActivityRow[]> {
  return (await db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').bind(limit).all<ActivityRow>()).results;
}

// ── Legacy ────────────────────────────────────────────────────────────────────

export async function getLatestSnapshot(db: D1Database): Promise<Snapshot | null> {
  return db.prepare('SELECT * FROM snapshots ORDER BY id DESC LIMIT 1').first<Snapshot>();
}

export async function upsertSnapshot(db: D1Database, payload: string): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO snapshots (id, payload, created_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at
  `).bind(payload, now).run();
}

export async function listBackups(db: D1Database): Promise<Backup[]> {
  return (await db.prepare('SELECT id, version, label, updated_by, created_at FROM backups ORDER BY created_at DESC').all<Backup>()).results;
}

export async function createBackup(db: D1Database, version: string, label: string, updatedBy: string, payload: string): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.prepare('INSERT INTO backups (version, label, updated_by, created_at, payload) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(version, label, updatedBy, now, payload).first<{ id: number }>();
  return r!.id;
}

export async function getBackup(db: D1Database, id: number): Promise<Backup | null> {
  return db.prepare('SELECT * FROM backups WHERE id = ?').bind(id).first<Backup>();
}

export async function deleteBackup(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM backups WHERE id = ?').bind(id).run();
}

export async function countBackups(db: D1Database): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) as c FROM backups').first<{ c: number }>();
  return r?.c ?? 0;
}

export async function upsertVisitor(db: D1Database, deviceId: string, timezone: string, locale: string): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO visitors (device_id, first_seen, last_seen, visit_count, timezone, locale)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen, visit_count = visit_count + 1
  `).bind(deviceId, now, now, timezone, locale).run();
}

export async function listVisitors(db: D1Database): Promise<Visitor[]> {
  return (await db.prepare('SELECT * FROM visitors ORDER BY last_seen DESC').all<Visitor>()).results;
}
