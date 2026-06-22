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

export interface ScheduleResult {
  nodes: Map<string, ScheduleNode>;
  projectEnd: number;
  criticalChain: string[];
}

export type NodeKey = string; // `${level}:${id}`
export const nodeKey = (level: ItemLevel, id: number): NodeKey => `${level}:${id}`;
