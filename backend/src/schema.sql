-- ── Core portfolio tables ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL DEFAULT 'Truflo AI',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  name         TEXT    NOT NULL,
  description  TEXT,
  owner        TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending',
  start_date   TEXT,
  end_date     TEXT,
  color        TEXT    NOT NULL DEFAULT '#58A6FF',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  pert_o       REAL,
  pert_m       REAL,
  pert_p       REAL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  start_date TEXT,
  end_date   TEXT,
  owner      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pert_o     REAL,
  pert_m     REAL,
  pert_p     REAL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  label      TEXT    NOT NULL,
  start_date TEXT,
  end_date   TEXT,
  owner      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pert_o     REAL,
  pert_m     REAL,
  pert_p     REAL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id    INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  owner       TEXT,
  optimistic  REAL,
  most_likely REAL,
  pessimistic REAL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dependencies (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  predecessor_id    INTEGER NOT NULL,
  successor_id      INTEGER NOT NULL,
  predecessor_level TEXT    NOT NULL DEFAULT 'project',
  successor_level   TEXT    NOT NULL DEFAULT 'project',
  type              TEXT    NOT NULL DEFAULT 'FS',
  lag_days          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(predecessor_id, successor_id)
);

-- ── Activity log — every write auto-records here ───────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor       TEXT    NOT NULL,           -- who made the change
  entity_type TEXT    NOT NULL,           -- 'project' | 'version' | 'phase' | 'task' | 'dependency'
  entity_id   INTEGER,
  entity_name TEXT,                       -- snapshot of name at time of change
  action      TEXT    NOT NULL,           -- 'created' | 'updated' | 'deleted'
  diff_json   TEXT,                       -- JSON with changed fields (before/after)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Legacy tables (kept for backward compat) ───────────────────────────────
CREATE TABLE IF NOT EXISTS snapshots (
  id         INTEGER PRIMARY KEY,
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  version    TEXT NOT NULL,
  label      TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL UNIQUE,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1,
  timezone    TEXT NOT NULL DEFAULT '',
  locale      TEXT NOT NULL DEFAULT ''
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_workspace   ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_versions_project     ON versions(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_project       ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_version       ON phases(version_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase          ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_deps_predecessor     ON dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_deps_successor       ON dependencies(successor_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity      ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_created     ON activity_log(created_at DESC);
