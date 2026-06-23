export type DepType = 'FS' | 'SS' | 'FF' | 'SF';
export type ItemStatus = 'on-track' | 'at-risk' | 'critical' | 'pending' | 'done';
export type ItemLevel = 'project' | 'version' | 'phase' | 'task';

export interface Workspace {
  id: number;
  name: string;
  createdAt: string;
  schemaVersion: number;
}

export interface Project {
  id: number;
  workspaceId: number;
  name: string;
  description?: string;
  owner?: string;
  status: ItemStatus;
  startDate?: string;
  endDate?: string;
  color: string;
  order: number;
  // PERT estimates (weeks)
  pertO?: number;
  pertM?: number;
  pertP?: number;
  // Computed by engine
  te?: number;
  variance?: number;
  ES?: number;
  EF?: number;
  LS?: number;
  LF?: number;
  slack?: number;
  isCritical?: boolean;
  estimatePending?: boolean;
}

export interface Version {
  id: number;
  projectId: number;
  label: string;
  startDate?: string;
  endDate?: string;
  owner?: string;
  order: number;
  pertO?: number;
  pertM?: number;
  pertP?: number;
  te?: number;
  variance?: number;
  ES?: number;
  EF?: number;
  LS?: number;
  LF?: number;
  slack?: number;
  isCritical?: boolean;
}

export interface Phase {
  id: number;
  projectId: number;
  versionId?: number;
  label: string;
  startDate?: string;
  endDate?: string;
  owner?: string;
  order: number;
  pertO?: number;
  pertM?: number;
  pertP?: number;
  te?: number;
  variance?: number;
  ES?: number;
  EF?: number;
  LS?: number;
  LF?: number;
  slack?: number;
  isCritical?: boolean;
}

export interface Task {
  id: number;
  phaseId: number;
  name: string;
  owner?: string;
  optimistic?: number;
  mostLikely?: number;
  pessimistic?: number;
  computedTe?: number;
  variance?: number;
  ES?: number;
  EF?: number;
  LS?: number;
  LF?: number;
  slack?: number;
  isCritical?: boolean;
}

export interface Dependency {
  id: number;
  predecessorId: number;
  successorId: number;
  predecessorLevel: ItemLevel;
  successorLevel: ItemLevel;
  type: DepType;
  lagDays: number;
}

export interface ScheduleNode {
  id: number;
  level: ItemLevel;
  name: string;
  te: number;
  variance: number | null;
  ES: number;
  EF: number;
  LS: number;
  LF: number;
  slack: number;
  isCritical: boolean;
  estimatePending: boolean;
  color?: string;
  owner?: string;
  status?: ItemStatus;
  startDate?: string;
  endDate?: string;
  pertO?: number;
  pertM?: number;
  pertP?: number;
}

export interface BackupVersion {
  id: number;
  version: string;       // e.g. "V1", "V2"
  label: string;         // user-supplied description
  updatedBy: string;     // who made the change
  createdAt: string;     // ISO timestamp
  payload: string;       // full JSON snapshot (workspaces+projects+deps+...)
}

export interface VisitorRecord {
  id: number;
  deviceId: string;      // random UUID stored in localStorage
  firstSeen: string;     // ISO timestamp of first visit
  lastSeen: string;      // ISO timestamp of most recent visit
  visitCount: number;
  timezone: string;      // e.g. "Asia/Kolkata"
  locale: string;        // e.g. "en-IN"
}

export interface ScheduleResult {
  nodes: Map<string, ScheduleNode>;
  projectEnd: number;
  criticalChain: string[];
}

export type NodeKey = string; // `${level}:${id}`
export const nodeKey = (level: ItemLevel, id: number): NodeKey => `${level}:${id}`;
