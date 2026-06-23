// API client — all requests go to VITE_API_URL (backend is source of truth).
// GET routes: open (no auth).
// POST / PATCH / DELETE: send X-Admin-Password + X-Actor headers.

import { getStoredPassword } from './auth';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function url(path: string) { return `${BASE}${path}`; }

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Admin-Password': getStoredPassword(),
    'X-Actor': getStoredActor(),
    ...extra,
  };
}

// Actor name stored in localStorage (user sets it once)
const ACTOR_KEY = 'autopilot_actor';
export function getStoredActor(): string {
  return localStorage.getItem(ACTOR_KEY) ?? 'Team';
}
export function setStoredActor(name: string): void {
  localStorage.setItem(ACTOR_KEY, name);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ServerProject {
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

export interface ServerVersion {
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
}

export interface ServerPhase {
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
}

export interface ServerTask {
  id: number;
  phase_id: number;
  name: string;
  owner: string | null;
  optimistic: number | null;
  most_likely: number | null;
  pessimistic: number | null;
}

export interface ServerDependency {
  id: number;
  predecessor_id: number;
  successor_id: number;
  predecessor_level: string;
  successor_level: string;
  type: string;
  lag_days: number;
}

export interface ServerActivity {
  id: number;
  actor: string;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  action: string;
  diff_json: string | null;
  created_at: string;
}

export interface Portfolio {
  workspaces: { id: number; name: string; created_at: string; schema_version: number }[];
  projects: ServerProject[];
  versions: ServerVersion[];
  phases: ServerPhase[];
  tasks: ServerTask[];
  dependencies: ServerDependency[];
}

// ── Portfolio (full snapshot) ─────────────────────────────────────────────────

export async function fetchPortfolio(): Promise<Portfolio | null> {
  try {
    const res = await fetch(url('/api/v1/portfolio'), { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export async function patchWorkspace(name: string): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url('/api/v1/workspace'), {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ name }),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<ServerProject[]> {
  try {
    const res = await fetch(url('/api/v1/projects'));
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function apiCreateProject(data: {
  name: string; description?: string; owner?: string; status?: string;
  startDate?: string; endDate?: string; color?: string;
  pertO?: number; pertM?: number; pertP?: number;
}): Promise<{ id: number } | { error: string }> {
  try {
    const res = await fetch(url('/api/v1/projects'), {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    const j = await res.json();
    if (!res.ok) return { error: (j as { error: string }).error ?? 'Server error' };
    return j as { id: number };
  } catch (e) { return { error: String(e) }; }
}

export async function apiUpdateProject(id: number, data: Record<string, unknown>): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/projects/${id}`), {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

export async function apiDeleteProject(id: number): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/projects/${id}`), {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

export async function apiReorderProjects(ids: number[]): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url('/api/v1/projects/reorder'), {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ ids }),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

// ── Versions ──────────────────────────────────────────────────────────────────

export async function apiCreateVersion(projectId: number, data: {
  label: string; startDate?: string; endDate?: string; owner?: string;
  pertO?: number; pertM?: number; pertP?: number;
}): Promise<{ id: number } | { error: string }> {
  try {
    const res = await fetch(url(`/api/v1/projects/${projectId}/versions`), {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    const j = await res.json();
    if (!res.ok) return { error: (j as { error: string }).error };
    return j as { id: number };
  } catch (e) { return { error: String(e) }; }
}

export async function apiUpdateVersion(id: number, data: Record<string, unknown>): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/versions/${id}`), {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

export async function apiDeleteVersion(id: number): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/versions/${id}`), {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

// ── Phases ────────────────────────────────────────────────────────────────────

export async function apiCreatePhase(projectId: number, data: {
  label: string; versionId?: number; startDate?: string; endDate?: string; owner?: string;
  pertO?: number; pertM?: number; pertP?: number;
}): Promise<{ id: number } | { error: string }> {
  try {
    const res = await fetch(url(`/api/v1/projects/${projectId}/phases`), {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    const j = await res.json();
    if (!res.ok) return { error: (j as { error: string }).error };
    return j as { id: number };
  } catch (e) { return { error: String(e) }; }
}

export async function apiUpdatePhase(id: number, data: Record<string, unknown>): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/phases/${id}`), {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

export async function apiDeletePhase(id: number): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/phases/${id}`), {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function apiCreateTask(data: {
  phaseId: number; name: string; owner?: string;
  optimistic?: number; mostLikely?: number; pessimistic?: number;
}): Promise<{ id: number } | { error: string }> {
  try {
    const res = await fetch(url('/api/v1/tasks'), {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    const j = await res.json();
    if (!res.ok) return { error: (j as { error: string }).error };
    return j as { id: number };
  } catch (e) { return { error: String(e) }; }
}

export async function apiUpdateTask(id: number, data: Record<string, unknown>): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/tasks/${id}`), {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

export async function apiDeleteTask(id: number): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/tasks/${id}`), {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

// ── Dependencies ──────────────────────────────────────────────────────────────

export async function apiCreateDependency(data: {
  predecessorId: number; successorId: number;
  predecessorLevel?: string; successorLevel?: string;
  type?: string; lagDays?: number;
}): Promise<{ id: number } | { error: string; status?: number }> {
  try {
    const res = await fetch(url('/api/v1/dependencies'), {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    const j = await res.json();
    if (!res.ok) return { error: (j as { error: string }).error, status: res.status };
    return j as { id: number };
  } catch (e) { return { error: String(e) }; }
}

export async function apiDeleteDependency(id: number): Promise<true | { error: string; status: number }> {
  try {
    const res = await fetch(url(`/api/v1/dependencies/${id}`), {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) return { error: 'Request failed', status: res.status };
    return true;
  } catch (e) { return { error: String(e), status: 0 }; }
}

// ── Import (backup JSON → backend) ────────────────────────────────────────────

export async function apiImportPortfolio(
  data: Record<string, unknown>,
): Promise<{ ok: true; imported: Record<string, number> } | { error: string; status: number }> {
  try {
    const res = await fetch(url('/api/v1/import'), {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    const j = await res.json();
    if (!res.ok) return { error: (j as { error: string }).error ?? 'Import failed', status: res.status };
    return j as { ok: true; imported: Record<string, number> };
  } catch (e) { return { error: String(e), status: 0 }; }
}

// ── Activity ──────────────────────────────────────────────────────────────────

export async function fetchActivity(limit = 100): Promise<ServerActivity[]> {
  try {
    const res = await fetch(url(`/api/v1/activity?limit=${limit}`));
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

// ── Legacy (seed, backups, visitors) ─────────────────────────────────────────

export async function fetchSeed(): Promise<Record<string, unknown[]> | null> {
  try {
    const res = await fetch(url('/api/seed'), { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function publishSeedToServer(payload: unknown, adminPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url('/api/seed'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const j = await res.json() as { error: string }; return { ok: false, error: j.error }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export interface ServerBackup {
  id: number;
  version: string;
  label: string;
  updated_by: string;
  created_at: string;
}

export async function fetchServerBackups(): Promise<ServerBackup[]> {
  try {
    const res = await fetch(url('/api/backups'));
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function createServerBackup(updatedBy: string, label: string, payload: unknown): Promise<{ id: number; version: string } | null> {
  try {
    const res = await fetch(url('/api/backups'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedBy, label, payload }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function fetchServerBackupPayload(id: number): Promise<Record<string, unknown[]> | null> {
  try {
    const res = await fetch(url(`/api/backups/${id}`));
    if (!res.ok) return null;
    const j = await res.json() as { payload: Record<string, unknown[]> };
    return j.payload;
  } catch { return null; }
}

export async function deleteServerBackup(id: number, adminPassword: string): Promise<boolean> {
  try {
    const res = await fetch(url(`/api/backups/${id}`), {
      method: 'DELETE',
      headers: { 'X-Admin-Password': adminPassword },
    });
    return res.ok;
  } catch { return false; }
}

export interface ServerVisitor {
  id: number;
  device_id: string;
  first_seen: string;
  last_seen: string;
  visit_count: number;
  timezone: string;
  locale: string;
}

export async function recordVisitServer(deviceId: string, timezone: string, locale: string): Promise<void> {
  try {
    await fetch(url('/api/visitors'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, timezone, locale }),
    });
  } catch { /* best-effort */ }
}

export async function fetchServerVisitors(): Promise<ServerVisitor[]> {
  try {
    const res = await fetch(url('/api/visitors'));
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}
