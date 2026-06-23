import { Hono } from 'hono';
import { corsMiddleware, adminAuth } from './middleware';
import {
  // Portfolio
  getPortfolio, ensureWorkspaceRow, updateWorkspace,
  // Projects
  listProjects, getProject, createProject, updateProject, deleteProject, reorderProjects,
  // Versions
  listVersions, createVersion, updateVersion, deleteVersion,
  // Phases
  listPhases, createPhase, updatePhase, deletePhase,
  // Tasks
  listTasks, createTask, updateTask, deleteTask,
  // Dependencies
  listDependencies, createDependency, deleteDependency,
  // Activity
  logActivity, listActivity,
  // Legacy
  getLatestSnapshot, upsertSnapshot,
  listBackups, createBackup, getBackup, deleteBackup, countBackups,
  upsertVisitor, listVisitors,
} from './db';
import type { D1Env } from './db';

const app = new Hono<{ Bindings: D1Env }>();

app.use('*', corsMiddleware);

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// ════════════════════════════════════════════════════════════════════════════════
// API v1 — live portfolio CRUD (backend is source of truth)
// GET  routes: open to all
// POST / PATCH / DELETE: require X-Admin-Password header
// ════════════════════════════════════════════════════════════════════════════════

// ── Full portfolio snapshot ────────────────────────────────────────────────────
app.get('/api/v1/portfolio', async (c) => {
  await ensureWorkspaceRow(c.env.DB);
  const data = await getPortfolio(c.env.DB);
  return c.json(data);
});

// ── Workspace ──────────────────────────────────────────────────────────────────
app.patch('/api/v1/workspace', adminAuth, async (c) => {
  const ws = await ensureWorkspaceRow(c.env.DB);
  const body = await c.req.json<{ name: string }>();
  if (!body.name) return c.json({ error: 'name required' }, 400);
  await updateWorkspace(c.env.DB, ws.id, body.name);
  return c.json({ ok: true });
});

// ── Projects ──────────────────────────────────────────────────────────────────
app.get('/api/v1/projects', async (c) => {
  const projects = await listProjects(c.env.DB);
  return c.json(projects);
});

app.get('/api/v1/projects/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const project = await getProject(c.env.DB, id);
  if (!project) return c.json({ error: 'Not found' }, 404);
  return c.json(project);
});

app.post('/api/v1/projects', adminAuth, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.name) return c.json({ error: 'name required' }, 400);
  const ws = await ensureWorkspaceRow(c.env.DB);
  const existing = await listProjects(c.env.DB);
  const id = await createProject(c.env.DB, {
    workspace_id: ws.id,
    name: String(body.name),
    description: (body.description as string) ?? null,
    owner: (body.owner as string) ?? null,
    status: (body.status as string) ?? 'pending',
    start_date: (body.startDate as string) ?? null,
    end_date: (body.endDate as string) ?? null,
    color: (body.color as string) ?? '#58A6FF',
    sort_order: existing.length,
    pert_o: (body.pertO as number) ?? null,
    pert_m: (body.pertM as number) ?? null,
    pert_p: (body.pertP as number) ?? null,
  });
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'project', id, String(body.name), 'created', null);
  return c.json({ id }, 201);
});

app.patch('/api/v1/projects/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const before = await getProject(c.env.DB, id);
  if (!before) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<Record<string, unknown>>();
  // Map camelCase → snake_case
  const patch: Record<string, unknown> = {};
  if ('name' in body)        patch.name = body.name;
  if ('description' in body) patch.description = body.description;
  if ('owner' in body)       patch.owner = body.owner;
  if ('status' in body)      patch.status = body.status;
  if ('startDate' in body)   patch.start_date = body.startDate;
  if ('endDate' in body)     patch.end_date = body.endDate;
  if ('color' in body)       patch.color = body.color;
  if ('order' in body)       patch.sort_order = body.order;
  if ('pertO' in body)       patch.pert_o = body.pertO;
  if ('pertM' in body)       patch.pert_m = body.pertM;
  if ('pertP' in body)       patch.pert_p = body.pertP;
  await updateProject(c.env.DB, id, patch);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'project', id, before.name, 'updated', patch);
  return c.json({ ok: true });
});

app.delete('/api/v1/projects/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const project = await getProject(c.env.DB, id);
  if (!project) return c.json({ error: 'Not found' }, 404);
  await deleteProject(c.env.DB, id);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'project', id, project.name, 'deleted', null);
  return c.json({ ok: true });
});

app.post('/api/v1/projects/reorder', adminAuth, async (c) => {
  const body = await c.req.json<{ ids: number[] }>();
  if (!Array.isArray(body.ids)) return c.json({ error: 'ids array required' }, 400);
  await reorderProjects(c.env.DB, body.ids);
  return c.json({ ok: true });
});

// ── Versions ──────────────────────────────────────────────────────────────────
app.get('/api/v1/projects/:id/versions', async (c) => {
  const projectId = Number(c.req.param('id'));
  return c.json(await listVersions(c.env.DB, projectId));
});

app.post('/api/v1/projects/:id/versions', adminAuth, async (c) => {
  const projectId = Number(c.req.param('id'));
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.label) return c.json({ error: 'label required' }, 400);
  const existing = await listVersions(c.env.DB, projectId);
  const id = await createVersion(c.env.DB, {
    project_id: projectId,
    label: String(body.label),
    start_date: (body.startDate as string) ?? null,
    end_date: (body.endDate as string) ?? null,
    owner: (body.owner as string) ?? null,
    sort_order: existing.length,
    pert_o: (body.pertO as number) ?? null,
    pert_m: (body.pertM as number) ?? null,
    pert_p: (body.pertP as number) ?? null,
  });
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'version', id, String(body.label), 'created', { projectId });
  return c.json({ id }, 201);
});

app.patch('/api/v1/versions/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, unknown> = {};
  if ('label' in body)      patch.label = body.label;
  if ('startDate' in body)  patch.start_date = body.startDate;
  if ('endDate' in body)    patch.end_date = body.endDate;
  if ('owner' in body)      patch.owner = body.owner;
  if ('order' in body)      patch.sort_order = body.order;
  if ('pertO' in body)      patch.pert_o = body.pertO;
  if ('pertM' in body)      patch.pert_m = body.pertM;
  if ('pertP' in body)      patch.pert_p = body.pertP;
  await updateVersion(c.env.DB, id, patch);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'version', id, String(body.label ?? id), 'updated', patch);
  return c.json({ ok: true });
});

app.delete('/api/v1/versions/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  await deleteVersion(c.env.DB, id);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'version', id, null, 'deleted', null);
  return c.json({ ok: true });
});

// ── Phases ────────────────────────────────────────────────────────────────────
app.get('/api/v1/projects/:id/phases', async (c) => {
  const projectId = Number(c.req.param('id'));
  return c.json(await listPhases(c.env.DB, projectId));
});

app.post('/api/v1/projects/:id/phases', adminAuth, async (c) => {
  const projectId = Number(c.req.param('id'));
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.label) return c.json({ error: 'label required' }, 400);
  const existing = await listPhases(c.env.DB, projectId);
  const id = await createPhase(c.env.DB, {
    project_id: projectId,
    version_id: (body.versionId as number) ?? null,
    label: String(body.label),
    start_date: (body.startDate as string) ?? null,
    end_date: (body.endDate as string) ?? null,
    owner: (body.owner as string) ?? null,
    sort_order: existing.length,
    pert_o: (body.pertO as number) ?? null,
    pert_m: (body.pertM as number) ?? null,
    pert_p: (body.pertP as number) ?? null,
  });
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'phase', id, String(body.label), 'created', { projectId });
  return c.json({ id }, 201);
});

app.patch('/api/v1/phases/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, unknown> = {};
  if ('label' in body)      patch.label = body.label;
  if ('startDate' in body)  patch.start_date = body.startDate;
  if ('endDate' in body)    patch.end_date = body.endDate;
  if ('owner' in body)      patch.owner = body.owner;
  if ('versionId' in body)  patch.version_id = body.versionId;
  if ('order' in body)      patch.sort_order = body.order;
  if ('pertO' in body)      patch.pert_o = body.pertO;
  if ('pertM' in body)      patch.pert_m = body.pertM;
  if ('pertP' in body)      patch.pert_p = body.pertP;
  await updatePhase(c.env.DB, id, patch);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'phase', id, String(body.label ?? id), 'updated', patch);
  return c.json({ ok: true });
});

app.delete('/api/v1/phases/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  await deletePhase(c.env.DB, id);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'phase', id, null, 'deleted', null);
  return c.json({ ok: true });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get('/api/v1/tasks', async (c) => {
  const phaseId = Number(c.req.query('phaseId') ?? '0');
  if (!phaseId) return c.json({ error: 'phaseId query param required' }, 400);
  return c.json(await listTasks(c.env.DB, phaseId));
});

app.post('/api/v1/tasks', adminAuth, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.phaseId || !body.name) return c.json({ error: 'phaseId and name required' }, 400);
  const id = await createTask(c.env.DB, {
    phase_id: Number(body.phaseId),
    name: String(body.name),
    owner: (body.owner as string) ?? null,
    optimistic: (body.optimistic as number) ?? null,
    most_likely: (body.mostLikely as number) ?? null,
    pessimistic: (body.pessimistic as number) ?? null,
  });
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'task', id, String(body.name), 'created', { phaseId: body.phaseId });
  return c.json({ id }, 201);
});

app.patch('/api/v1/tasks/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, unknown> = {};
  if ('name' in body)        patch.name = body.name;
  if ('owner' in body)       patch.owner = body.owner;
  if ('optimistic' in body)  patch.optimistic = body.optimistic;
  if ('mostLikely' in body)  patch.most_likely = body.mostLikely;
  if ('pessimistic' in body) patch.pessimistic = body.pessimistic;
  await updateTask(c.env.DB, id, patch);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'task', id, String(body.name ?? id), 'updated', patch);
  return c.json({ ok: true });
});

app.delete('/api/v1/tasks/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  await deleteTask(c.env.DB, id);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'task', id, null, 'deleted', null);
  return c.json({ ok: true });
});

// ── Dependencies ──────────────────────────────────────────────────────────────
app.get('/api/v1/dependencies', async (c) => {
  return c.json(await listDependencies(c.env.DB));
});

app.post('/api/v1/dependencies', adminAuth, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.predecessorId || !body.successorId) return c.json({ error: 'predecessorId and successorId required' }, 400);
  const id = await createDependency(c.env.DB, {
    predecessor_id: Number(body.predecessorId),
    successor_id: Number(body.successorId),
    predecessor_level: (body.predecessorLevel as string) ?? 'project',
    successor_level: (body.successorLevel as string) ?? 'project',
    type: (body.type as string) ?? 'FS',
    lag_days: Number(body.lagDays ?? 0),
  });
  if (!id) return c.json({ error: 'Dependency already exists' }, 409);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'dependency', id, null, 'created',
    { predecessorId: body.predecessorId, successorId: body.successorId });
  return c.json({ id }, 201);
});

app.delete('/api/v1/dependencies/:id', adminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  await deleteDependency(c.env.DB, id);
  const actor = c.req.header('X-Actor') ?? 'unknown';
  await logActivity(c.env.DB, actor, 'dependency', id, null, 'deleted', null);
  return c.json({ ok: true });
});

// ── Import (wipe + reload from backup JSON) ───────────────────────────────────
app.post('/api/v1/import', adminAuth, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const data = (body.data ?? body) as Record<string, unknown[]>;

  const projects     = (data.projects     ?? []) as Record<string, unknown>[];
  const versions     = (data.versions     ?? []) as Record<string, unknown>[];
  const phases       = (data.phases       ?? []) as Record<string, unknown>[];
  const tasks        = (data.tasks        ?? []) as Record<string, unknown>[];
  const dependencies = (data.dependencies ?? []) as Record<string, unknown>[];
  const workspaceName = (data.workspaces as { name?: string }[] | undefined)?.[0]?.name ?? 'Truflo AI';

  const now = new Date().toISOString();
  const actor = c.req.header('X-Actor') ?? 'import';

  // Wipe portfolio tables, preserve backups/visitors/snapshots/activity_log
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM dependencies'),
    c.env.DB.prepare('DELETE FROM tasks'),
    c.env.DB.prepare('DELETE FROM phases'),
    c.env.DB.prepare('DELETE FROM versions'),
    c.env.DB.prepare('DELETE FROM projects'),
    c.env.DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('projects','versions','phases','tasks','dependencies')"),
    c.env.DB.prepare('UPDATE workspaces SET name = ? WHERE id = 1').bind(workspaceName),
  ]);

  // Insert in dependency order: projects → versions → phases → tasks → dependencies
  const projectStmts = projects.map((p) =>
    c.env.DB.prepare(`INSERT INTO projects (id, workspace_id, name, description, owner, status, start_date, end_date, color, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(p.id, p.name, p.description ?? null, p.owner ?? null,
      p.status ?? 'pending', p.startDate ?? p.start_date ?? null,
      p.endDate ?? p.end_date ?? null, p.color ?? '#58A6FF',
      p.order ?? p.sort_order ?? 0,
      p.pertO ?? p.pert_o ?? null, p.pertM ?? p.pert_m ?? null, p.pertP ?? p.pert_p ?? null,
      now, now));

  const versionStmts = versions.map((v) =>
    c.env.DB.prepare(`INSERT INTO versions (id, project_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(v.id, v.projectId ?? v.project_id, v.label,
      v.startDate ?? v.start_date ?? null, v.endDate ?? v.end_date ?? null,
      v.owner ?? null, v.order ?? v.sort_order ?? 0,
      v.pertO ?? v.pert_o ?? null, v.pertM ?? v.pert_m ?? null, v.pertP ?? v.pert_p ?? null,
      now, now));

  const phaseStmts = phases.map((p) =>
    c.env.DB.prepare(`INSERT INTO phases (id, project_id, version_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(p.id, p.projectId ?? p.project_id, p.versionId ?? p.version_id ?? null, p.label,
      p.startDate ?? p.start_date ?? null, p.endDate ?? p.end_date ?? null,
      p.owner ?? null, p.order ?? p.sort_order ?? 0,
      p.pertO ?? p.pert_o ?? null, p.pertM ?? p.pert_m ?? null, p.pertP ?? p.pert_p ?? null,
      now, now));

  const taskStmts = tasks.map((t) =>
    c.env.DB.prepare(`INSERT INTO tasks (id, phase_id, name, owner, optimistic, most_likely, pessimistic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(t.id, t.phaseId ?? t.phase_id, t.name, t.owner ?? null,
      t.optimistic ?? null, t.mostLikely ?? t.most_likely ?? null, t.pessimistic ?? null,
      now, now));

  const depStmts = dependencies.map((d) =>
    c.env.DB.prepare(`INSERT INTO dependencies (id, predecessor_id, successor_id, predecessor_level, successor_level, type, lag_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(d.id,
      d.predecessorId ?? d.predecessor_id,
      d.successorId   ?? d.successor_id,
      d.predecessorLevel ?? d.predecessor_level ?? 'project',
      d.successorLevel   ?? d.successor_level   ?? 'project',
      d.type ?? 'FS', d.lagDays ?? d.lag_days ?? 0));

  // D1 batch has a 100-statement limit; chunk if needed
  const all = [...projectStmts, ...versionStmts, ...phaseStmts, ...taskStmts, ...depStmts];
  for (let i = 0; i < all.length; i += 90) {
    await c.env.DB.batch(all.slice(i, i + 90));
  }

  await logActivity(c.env.DB, actor, 'workspace', 1, workspaceName, 'imported',
    { projects: projects.length, versions: versions.length, phases: phases.length, tasks: tasks.length, dependencies: dependencies.length });

  return c.json({ ok: true, imported: { projects: projects.length, versions: versions.length, phases: phases.length, tasks: tasks.length, dependencies: dependencies.length } });
});

// ── Activity feed ─────────────────────────────────────────────────────────────
app.get('/api/v1/activity', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 500);
  const rows = await listActivity(c.env.DB, limit);
  return c.json(rows);
});

// ════════════════════════════════════════════════════════════════════════════════
// Legacy API (seed, backups, visitors)
// ════════════════════════════════════════════════════════════════════════════════

app.get('/api/seed', async (c) => {
  const snap = await getLatestSnapshot(c.env.DB);
  if (!snap) return c.json({ error: 'No seed published yet' }, 404);
  return c.json(JSON.parse(snap.payload));
});

app.post('/api/seed', adminAuth, async (c) => {
  const body = await c.req.json();
  await upsertSnapshot(c.env.DB, JSON.stringify(body));
  return c.json({ ok: true });
});

app.get('/api/backups', async (c) => c.json(await listBackups(c.env.DB)));

app.post('/api/backups', async (c) => {
  const body = await c.req.json<{ updatedBy: string; label: string; payload: unknown }>();
  if (!body.updatedBy || !body.label || !body.payload) return c.json({ error: 'updatedBy, label, and payload are required' }, 400);
  const count = await countBackups(c.env.DB);
  const version = `V${count + 1}`;
  const id = await createBackup(c.env.DB, version, body.label, body.updatedBy, JSON.stringify(body.payload));
  return c.json({ id, version }, 201);
});

app.get('/api/backups/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const bv = await getBackup(c.env.DB, id);
  if (!bv) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...bv, payload: JSON.parse(bv.payload) });
});

app.delete('/api/backups/:id', adminAuth, async (c) => {
  await deleteBackup(c.env.DB, Number(c.req.param('id')));
  return c.json({ ok: true });
});

app.post('/api/visitors', async (c) => {
  const body = await c.req.json<{ deviceId: string; timezone: string; locale: string }>();
  if (!body.deviceId) return c.json({ error: 'deviceId required' }, 400);
  await upsertVisitor(c.env.DB, body.deviceId, body.timezone ?? '', body.locale ?? '');
  return c.json({ ok: true });
});

app.get('/api/visitors', async (c) => c.json(await listVisitors(c.env.DB)));

export default app;
