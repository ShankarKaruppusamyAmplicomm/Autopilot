/**
 * Local dev server — mirrors the Cloudflare Worker API exactly.
 * Uses better-sqlite3. Run via Docker for local testing.
 */
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Database ──────────────────────────────────────────────────────────────────
const DATA_DIR = join(__dirname, '.data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'autopilot.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(join(__dirname, 'src', 'schema.sql'), 'utf8');
schema.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => {
  try { db.prepare(stmt).run(); } catch (e) { /* ignore "already exists" on re-run */ }
});

// Ensure workspace row exists
const ws = db.prepare('SELECT id FROM workspaces LIMIT 1').get();
if (!ws) db.prepare("INSERT INTO workspaces (name, schema_version) VALUES ('Truflo AI', 1)").run();

console.log('✓ SQLite ready at .data/autopilot.sqlite');

// ── Auth ──────────────────────────────────────────────────────────────────────
const ADMIN_HASH = 'af76b3db969e180b4a6dc1db5662f956e0407b9e3272c554f3d7038a3d4f800c';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-Actor',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req, res) {
  const pw = req.headers['x-admin-password'] ?? '';
  if (!pw) { json(res, { error: 'Admin password required' }, 401); return false; }
  if (sha256(pw) !== ADMIN_HASH) { json(res, { error: 'Incorrect password' }, 403); return false; }
  return true;
}

function actor(req) { return req.headers['x-actor'] ?? 'unknown'; }

function logActivity(actorName, entityType, entityId, entityName, action, diff) {
  db.prepare(`INSERT INTO activity_log (actor, entity_type, entity_id, entity_name, action, diff_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(actorName, entityType, entityId ?? null, entityName ?? null, action, diff ? JSON.stringify(diff) : null, new Date().toISOString());
}

// ── Route handlers ────────────────────────────────────────────────────────────

// GET /api/v1/portfolio
function getPortfolio(req, res) {
  const workspaces  = db.prepare('SELECT * FROM workspaces LIMIT 1').all();
  const projects    = db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, id ASC').all();
  const versions    = db.prepare('SELECT * FROM versions ORDER BY sort_order ASC, id ASC').all();
  const phases      = db.prepare('SELECT * FROM phases ORDER BY sort_order ASC, id ASC').all();
  const tasks       = db.prepare('SELECT * FROM tasks ORDER BY id ASC').all();
  const dependencies = db.prepare('SELECT * FROM dependencies ORDER BY id ASC').all();
  json(res, { workspaces, projects, versions, phases, tasks, dependencies });
}

// PATCH /api/v1/workspace
async function patchWorkspace(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  if (!body.name) return json(res, { error: 'name required' }, 400);
  db.prepare('UPDATE workspaces SET name = ? WHERE id = 1').run(body.name);
  json(res, { ok: true });
}

// GET /api/v1/projects
function getProjects(req, res) {
  json(res, db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, id ASC').all());
}

// GET /api/v1/projects/:id
function getProject(req, res, id) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) return json(res, { error: 'Not found' }, 404);
  json(res, row);
}

// POST /api/v1/projects
async function postProject(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  if (!body.name) return json(res, { error: 'name required' }, 400);
  const wsId = db.prepare('SELECT id FROM workspaces LIMIT 1').get()?.id ?? 1;
  const count = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
  const now = new Date().toISOString();
  const r = db.prepare(`INSERT INTO projects
    (workspace_id, name, description, owner, status, start_date, end_date, color, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(wsId, body.name, body.description ?? null, body.owner ?? null,
    body.status ?? 'pending', body.startDate ?? null, body.endDate ?? null,
    body.color ?? '#58A6FF', count,
    body.pertO ?? null, body.pertM ?? null, body.pertP ?? null, now, now);
  const id = r.lastInsertRowid;
  logActivity(actor(req), 'project', id, body.name, 'created', null);
  json(res, { id }, 201);
}

// PATCH /api/v1/projects/:id
async function patchProject(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const before = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!before) return json(res, { error: 'Not found' }, 404);
  const body = await readBody(req);
  const now = new Date().toISOString();
  const map = { name:'name', description:'description', owner:'owner', status:'status',
    startDate:'start_date', endDate:'end_date', color:'color', order:'sort_order',
    pertO:'pert_o', pertM:'pert_m', pertP:'pert_p' };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (k in body) { sets.push(`${col} = ?`); vals.push(body[k] ?? null); }
  }
  if (sets.length) {
    sets.push('updated_at = ?'); vals.push(now, id);
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  logActivity(actor(req), 'project', id, before.name, 'updated', body);
  json(res, { ok: true });
}

// DELETE /api/v1/projects/:id
function deleteProject(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const row = db.prepare('SELECT name FROM projects WHERE id = ?').get(id);
  if (!row) return json(res, { error: 'Not found' }, 404);
  db.prepare("DELETE FROM dependencies WHERE predecessor_id = ? AND predecessor_level = 'project'").run(id);
  db.prepare("DELETE FROM dependencies WHERE successor_id = ? AND successor_level = 'project'").run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  logActivity(actor(req), 'project', id, row.name, 'deleted', null);
  json(res, { ok: true });
}

// POST /api/v1/projects/reorder
async function reorderProjects(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  if (!Array.isArray(body.ids)) return json(res, { error: 'ids array required' }, 400);
  const stmt = db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => ids.forEach((id, i) => stmt.run(i, id)));
  tx(body.ids);
  json(res, { ok: true });
}

// GET /api/v1/projects/:id/versions
function getVersions(req, res, projectId) {
  json(res, db.prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY sort_order ASC, id ASC').all(projectId));
}

// POST /api/v1/projects/:id/versions
async function postVersion(req, res, projectId) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  if (!body.label) return json(res, { error: 'label required' }, 400);
  const count = db.prepare('SELECT COUNT(*) as c FROM versions WHERE project_id = ?').get(projectId).c;
  const now = new Date().toISOString();
  const r = db.prepare(`INSERT INTO versions
    (project_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(projectId, body.label, body.startDate ?? null, body.endDate ?? null,
    body.owner ?? null, count, body.pertO ?? null, body.pertM ?? null, body.pertP ?? null, now, now);
  logActivity(actor(req), 'version', r.lastInsertRowid, body.label, 'created', { projectId });
  json(res, { id: r.lastInsertRowid }, 201);
}

// PATCH /api/v1/versions/:id
async function patchVersion(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const now = new Date().toISOString();
  const map = { label:'label', startDate:'start_date', endDate:'end_date', owner:'owner',
    order:'sort_order', pertO:'pert_o', pertM:'pert_m', pertP:'pert_p' };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (k in body) { sets.push(`${col} = ?`); vals.push(body[k] ?? null); }
  }
  if (sets.length) {
    sets.push('updated_at = ?'); vals.push(now, id);
    db.prepare(`UPDATE versions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  logActivity(actor(req), 'version', id, body.label ?? String(id), 'updated', body);
  json(res, { ok: true });
}

// DELETE /api/v1/versions/:id
function deleteVersion(req, res, id) {
  if (!requireAdmin(req, res)) return;
  db.prepare('DELETE FROM versions WHERE id = ?').run(id);
  logActivity(actor(req), 'version', id, null, 'deleted', null);
  json(res, { ok: true });
}

// GET /api/v1/projects/:id/phases
function getPhases(req, res, projectId) {
  json(res, db.prepare('SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order ASC, id ASC').all(projectId));
}

// POST /api/v1/projects/:id/phases
async function postPhase(req, res, projectId) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  if (!body.label) return json(res, { error: 'label required' }, 400);
  const count = db.prepare('SELECT COUNT(*) as c FROM phases WHERE project_id = ?').get(projectId).c;
  const now = new Date().toISOString();
  const r = db.prepare(`INSERT INTO phases
    (project_id, version_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(projectId, body.versionId ?? null, body.label,
    body.startDate ?? null, body.endDate ?? null, body.owner ?? null, count,
    body.pertO ?? null, body.pertM ?? null, body.pertP ?? null, now, now);
  logActivity(actor(req), 'phase', r.lastInsertRowid, body.label, 'created', { projectId });
  json(res, { id: r.lastInsertRowid }, 201);
}

// PATCH /api/v1/phases/:id
async function patchPhase(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const now = new Date().toISOString();
  const map = { label:'label', startDate:'start_date', endDate:'end_date', owner:'owner',
    versionId:'version_id', order:'sort_order', pertO:'pert_o', pertM:'pert_m', pertP:'pert_p' };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (k in body) { sets.push(`${col} = ?`); vals.push(body[k] ?? null); }
  }
  if (sets.length) {
    sets.push('updated_at = ?'); vals.push(now, id);
    db.prepare(`UPDATE phases SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  logActivity(actor(req), 'phase', id, body.label ?? String(id), 'updated', body);
  json(res, { ok: true });
}

// DELETE /api/v1/phases/:id
function deletePhase(req, res, id) {
  if (!requireAdmin(req, res)) return;
  db.prepare('DELETE FROM dependencies WHERE predecessor_id = ? AND predecessor_level = "phase"').run(id);
  db.prepare('DELETE FROM dependencies WHERE successor_id = ? AND successor_level = "phase"').run(id);
  db.prepare('DELETE FROM phases WHERE id = ?').run(id);
  logActivity(actor(req), 'phase', id, null, 'deleted', null);
  json(res, { ok: true });
}

// GET /api/v1/tasks?phaseId=N
function getTasks(req, res, url) {
  const phaseId = Number(url.searchParams.get('phaseId') ?? '0');
  if (!phaseId) return json(res, { error: 'phaseId query param required' }, 400);
  json(res, db.prepare('SELECT * FROM tasks WHERE phase_id = ? ORDER BY id ASC').all(phaseId));
}

// POST /api/v1/tasks
async function postTask(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  if (!body.phaseId || !body.name) return json(res, { error: 'phaseId and name required' }, 400);
  const now = new Date().toISOString();
  const r = db.prepare(`INSERT INTO tasks (phase_id, name, owner, optimistic, most_likely, pessimistic, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(body.phaseId, body.name, body.owner ?? null,
    body.optimistic ?? null, body.mostLikely ?? null, body.pessimistic ?? null, now, now);
  logActivity(actor(req), 'task', r.lastInsertRowid, body.name, 'created', { phaseId: body.phaseId });
  json(res, { id: r.lastInsertRowid }, 201);
}

// PATCH /api/v1/tasks/:id
async function patchTask(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const now = new Date().toISOString();
  const map = { name:'name', owner:'owner', optimistic:'optimistic', mostLikely:'most_likely', pessimistic:'pessimistic' };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (k in body) { sets.push(`${col} = ?`); vals.push(body[k] ?? null); }
  }
  if (sets.length) {
    sets.push('updated_at = ?'); vals.push(now, id);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  logActivity(actor(req), 'task', id, body.name ?? String(id), 'updated', body);
  json(res, { ok: true });
}

// DELETE /api/v1/tasks/:id
function deleteTask(req, res, id) {
  if (!requireAdmin(req, res)) return;
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  logActivity(actor(req), 'task', id, null, 'deleted', null);
  json(res, { ok: true });
}

// GET /api/v1/dependencies
function getDependencies(req, res) {
  json(res, db.prepare('SELECT * FROM dependencies ORDER BY id ASC').all());
}

// POST /api/v1/dependencies
async function postDependency(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  if (!body.predecessorId || !body.successorId) return json(res, { error: 'predecessorId and successorId required' }, 400);
  const now = new Date().toISOString();
  let r;
  try {
    r = db.prepare(`INSERT OR IGNORE INTO dependencies
      (predecessor_id, successor_id, predecessor_level, successor_level, type, lag_days, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(body.predecessorId, body.successorId,
      body.predecessorLevel ?? 'project', body.successorLevel ?? 'project',
      body.type ?? 'FS', body.lagDays ?? 0, now);
  } catch (e) { return json(res, { error: 'Dependency already exists' }, 409); }
  if (!r.lastInsertRowid) return json(res, { error: 'Dependency already exists' }, 409);
  logActivity(actor(req), 'dependency', r.lastInsertRowid, null, 'created',
    { predecessorId: body.predecessorId, successorId: body.successorId });
  json(res, { id: r.lastInsertRowid }, 201);
}

// DELETE /api/v1/dependencies/:id
function deleteDependency(req, res, id) {
  if (!requireAdmin(req, res)) return;
  db.prepare('DELETE FROM dependencies WHERE id = ?').run(id);
  logActivity(actor(req), 'dependency', id, null, 'deleted', null);
  json(res, { ok: true });
}

// GET /api/v1/activity
function getActivity(req, res, url) {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 500);
  json(res, db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit));
}

// Legacy ──────────────────────────────────────────────────────────────────────

function getSeed(req, res) {
  const row = db.prepare('SELECT * FROM snapshots ORDER BY id DESC LIMIT 1').get();
  if (!row) return json(res, { error: 'No seed published yet' }, 404);
  json(res, JSON.parse(row.payload));
}
async function postSeed(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO snapshots (id, payload, created_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`
  ).run(JSON.stringify(body), now);
  json(res, { ok: true });
}
function getBackups(req, res) {
  json(res, db.prepare('SELECT id, version, label, updated_by, created_at FROM backups ORDER BY created_at DESC').all());
}
async function postBackup(req, res) {
  const body = await readBody(req);
  if (!body.updatedBy || !body.label || !body.payload) return json(res, { error: 'updatedBy, label, payload required' }, 400);
  const count = db.prepare('SELECT COUNT(*) as c FROM backups').get().c;
  const version = `V${count + 1}`;
  const now = new Date().toISOString();
  const r = db.prepare('INSERT INTO backups (version, label, updated_by, created_at, payload) VALUES (?, ?, ?, ?, ?)').run(version, body.label, body.updatedBy, now, JSON.stringify(body.payload));
  json(res, { id: r.lastInsertRowid, version }, 201);
}
function getBackupById(req, res, id) {
  const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  if (!row) return json(res, { error: 'Not found' }, 404);
  json(res, { ...row, payload: JSON.parse(row.payload) });
}
function deleteBackupById(req, res, id) {
  if (!requireAdmin(req, res)) return;
  db.prepare('DELETE FROM backups WHERE id = ?').run(id);
  json(res, { ok: true });
}
async function postVisitor(req, res) {
  const body = await readBody(req);
  if (!body.deviceId) return json(res, { error: 'deviceId required' }, 400);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO visitors (device_id, first_seen, last_seen, visit_count, timezone, locale)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen, visit_count = visit_count + 1`
  ).run(body.deviceId, now, now, body.timezone ?? '', body.locale ?? '');
  json(res, { ok: true });
}
function getVisitors(req, res) {
  json(res, db.prepare('SELECT * FROM visitors ORDER BY last_seen DESC').all());
}

// POST /api/v1/import — wipe all portfolio data and load from a backup JSON file
async function postImport(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);

  // Accept either the raw backup JSON or { data: <backup> }
  const data = body.data ?? body;

  const projects     = data.projects     ?? [];
  const versions     = data.versions     ?? [];
  const phases       = data.phases       ?? [];
  const tasks        = data.tasks        ?? [];
  const dependencies = data.dependencies ?? [];
  const workspaceName = data.workspaces?.[0]?.name ?? 'Truflo AI';

  const now = new Date().toISOString();
  const actorName = req.headers['x-actor'] ?? 'import';

  db.transaction(() => {
    // Wipe portfolio tables (leave backups, visitors, snapshots, activity_log intact)
    db.prepare('DELETE FROM dependencies').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM phases').run();
    db.prepare('DELETE FROM versions').run();
    db.prepare('DELETE FROM projects').run();
    // Reset sqlite auto-increment sequences so IDs start fresh
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('projects','versions','phases','tasks','dependencies')").run();

    // Update workspace name
    db.prepare('UPDATE workspaces SET name = ? WHERE id = 1').run(workspaceName);

    // Insert projects — preserve original IDs so dependencies reference correctly
    const insProject = db.prepare(`INSERT INTO projects
      (id, workspace_id, name, description, owner, status, start_date, end_date, color, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of projects) {
      insProject.run(
        p.id, p.name, p.description ?? null, p.owner ?? null,
        p.status ?? 'pending', p.startDate ?? p.start_date ?? null,
        p.endDate ?? p.end_date ?? null, p.color ?? '#58A6FF',
        p.order ?? p.sort_order ?? 0,
        p.pertO ?? p.pert_o ?? null, p.pertM ?? p.pert_m ?? null, p.pertP ?? p.pert_p ?? null,
        now, now,
      );
    }

    // Insert versions
    const insVersion = db.prepare(`INSERT INTO versions
      (id, project_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const v of versions) {
      insVersion.run(
        v.id, v.projectId ?? v.project_id, v.label,
        v.startDate ?? v.start_date ?? null, v.endDate ?? v.end_date ?? null,
        v.owner ?? null, v.order ?? v.sort_order ?? 0,
        v.pertO ?? v.pert_o ?? null, v.pertM ?? v.pert_m ?? null, v.pertP ?? v.pert_p ?? null,
        now, now,
      );
    }

    // Insert phases
    const insPhase = db.prepare(`INSERT INTO phases
      (id, project_id, version_id, label, start_date, end_date, owner, sort_order, pert_o, pert_m, pert_p, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of phases) {
      insPhase.run(
        p.id, p.projectId ?? p.project_id, p.versionId ?? p.version_id ?? null, p.label,
        p.startDate ?? p.start_date ?? null, p.endDate ?? p.end_date ?? null,
        p.owner ?? null, p.order ?? p.sort_order ?? 0,
        p.pertO ?? p.pert_o ?? null, p.pertM ?? p.pert_m ?? null, p.pertP ?? p.pert_p ?? null,
        now, now,
      );
    }

    // Insert tasks
    const insTask = db.prepare(`INSERT INTO tasks
      (id, phase_id, name, owner, optimistic, most_likely, pessimistic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const t of tasks) {
      insTask.run(
        t.id, t.phaseId ?? t.phase_id, t.name, t.owner ?? null,
        t.optimistic ?? null, t.mostLikely ?? t.most_likely ?? null, t.pessimistic ?? null,
        now, now,
      );
    }

    // Insert dependencies
    const insDep = db.prepare(`INSERT INTO dependencies
      (id, predecessor_id, successor_id, predecessor_level, successor_level, type, lag_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const d of dependencies) {
      insDep.run(
        d.id,
        d.predecessorId ?? d.predecessor_id,
        d.successorId   ?? d.successor_id,
        d.predecessorLevel ?? d.predecessor_level ?? 'project',
        d.successorLevel   ?? d.successor_level   ?? 'project',
        d.type ?? 'FS', d.lagDays ?? d.lag_days ?? 0,
      );
    }
  })();

  logActivity(actorName, 'workspace', 1, workspaceName, 'imported',
    { projects: projects.length, versions: versions.length, phases: phases.length, tasks: tasks.length, dependencies: dependencies.length });

  json(res, {
    ok: true,
    imported: { projects: projects.length, versions: versions.length, phases: phases.length, tasks: tasks.length, dependencies: dependencies.length },
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 8787;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-Actor',
    });
    return res.end();
  }

  try {
    // Health
    if (path === '/health') return json(res, { ok: true, db: 'sqlite', ts: new Date().toISOString() });

    // v1 — portfolio
    if (path === '/api/v1/portfolio' && method === 'GET') return getPortfolio(req, res);
    if (path === '/api/v1/workspace' && method === 'PATCH') return await patchWorkspace(req, res);

    // v1 — projects
    if (path === '/api/v1/projects' && method === 'GET') return getProjects(req, res);
    if (path === '/api/v1/projects/reorder' && method === 'POST') return await reorderProjects(req, res);
    if (path === '/api/v1/projects' && method === 'POST') return await postProject(req, res);

    const projectMatch = path.match(/^\/api\/v1\/projects\/(\d+)$/);
    if (projectMatch) {
      const id = Number(projectMatch[1]);
      if (method === 'GET')    return getProject(req, res, id);
      if (method === 'PATCH')  return await patchProject(req, res, id);
      if (method === 'DELETE') return deleteProject(req, res, id);
    }

    const versionsMatch = path.match(/^\/api\/v1\/projects\/(\d+)\/versions$/);
    if (versionsMatch) {
      const pid = Number(versionsMatch[1]);
      if (method === 'GET')  return getVersions(req, res, pid);
      if (method === 'POST') return await postVersion(req, res, pid);
    }

    const versionMatch = path.match(/^\/api\/v1\/versions\/(\d+)$/);
    if (versionMatch) {
      const id = Number(versionMatch[1]);
      if (method === 'PATCH')  return await patchVersion(req, res, id);
      if (method === 'DELETE') return deleteVersion(req, res, id);
    }

    const phasesMatch = path.match(/^\/api\/v1\/projects\/(\d+)\/phases$/);
    if (phasesMatch) {
      const pid = Number(phasesMatch[1]);
      if (method === 'GET')  return getPhases(req, res, pid);
      if (method === 'POST') return await postPhase(req, res, pid);
    }

    const phaseMatch = path.match(/^\/api\/v1\/phases\/(\d+)$/);
    if (phaseMatch) {
      const id = Number(phaseMatch[1]);
      if (method === 'PATCH')  return await patchPhase(req, res, id);
      if (method === 'DELETE') return deletePhase(req, res, id);
    }

    if (path === '/api/v1/tasks') {
      if (method === 'GET')  return getTasks(req, res, url);
      if (method === 'POST') return await postTask(req, res);
    }

    const taskMatch = path.match(/^\/api\/v1\/tasks\/(\d+)$/);
    if (taskMatch) {
      const id = Number(taskMatch[1]);
      if (method === 'PATCH')  return await patchTask(req, res, id);
      if (method === 'DELETE') return deleteTask(req, res, id);
    }

    if (path === '/api/v1/dependencies') {
      if (method === 'GET')  return getDependencies(req, res);
      if (method === 'POST') return await postDependency(req, res);
    }

    const depMatch = path.match(/^\/api\/v1\/dependencies\/(\d+)$/);
    if (depMatch) {
      const id = Number(depMatch[1]);
      if (method === 'DELETE') return deleteDependency(req, res, id);
    }

    if (path === '/api/v1/activity' && method === 'GET') return getActivity(req, res, url);

    if (path === '/api/v1/import' && method === 'POST') return await postImport(req, res);

    // Legacy
    if (path === '/api/seed') {
      if (method === 'GET')  return getSeed(req, res);
      if (method === 'POST') return await postSeed(req, res);
    }
    if (path === '/api/backups') {
      if (method === 'GET')  return getBackups(req, res);
      if (method === 'POST') return await postBackup(req, res);
    }
    const backupMatch = path.match(/^\/api\/backups\/(\d+)$/);
    if (backupMatch) {
      const id = Number(backupMatch[1]);
      if (method === 'GET')    return getBackupById(req, res, id);
      if (method === 'DELETE') return deleteBackupById(req, res, id);
    }
    if (path === '/api/visitors') {
      if (method === 'GET')  return getVisitors(req, res);
      if (method === 'POST') return await postVisitor(req, res);
    }

    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    console.error(err);
    json(res, { error: 'Internal server error', detail: String(err) }, 500);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Autopilot backend on http://0.0.0.0:${PORT}`);
  console.log('  v1: GET/POST /api/v1/portfolio, /projects, /versions, /phases, /tasks, /dependencies, /activity');
});
