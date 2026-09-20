export type TaskState = string;

export interface Finding {
  id: string;
  kind: "functional_bug" | "dependency_security";
  title: string;
  summary: string;
  severity: string;
  confidence: { value: number; rationale: string };
  evidence: Array<{
    id: string;
    kind: string;
    summary: string;
    path?: string;
    excerpt?: string;
  }>;
}

export interface RemediationTask {
  id: string;
  state: TaskState;
  findings: Finding[];
  selectedFindingId?: string;
  patch?: {
    branchName: string;
    commitSha?: string;
    changedFiles: string[];
    diffSummary: string;
  };
  verification?: {
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; output: string }>;
  };
  prArtifact?: {
    title: string;
    body: string;
    branchName: string;
    commitMessage: string;
  };
}

export interface AuditEvent {
  id: string;
  taskId: string;
  at: string;
  actor: string;
  action: string;
  fromState?: string;
  toState?: string;
  detail: string;
}

export interface BrainMap {
  nodes: Array<{
    id: string;
    kind: string;
    label: string;
    status: string;
    confidence: number;
    x?: number;
    y?: number;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: string;
    confidence: number;
  }>;
  activatedIds: string[];
}

export interface Grant {
  id: string;
  repositoryName: string;
  grantedBy: string;
  grantedAt: string;
  capabilities: string[];
}

const base = "";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${url}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json()) as T & { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? res.statusText);
  }
  return data;
}

export const api = {
  health: () => req<{ ok: boolean; fixturePath: string }>("/health"),
  listGrants: () => req<{ grants: Grant[] }>("/api/grants"),
  createGrant: (grantedBy: string) =>
    req<{ grant: Grant }>("/api/grants", {
      method: "POST",
      body: JSON.stringify({ grantedBy, notes: "Dashboard authorization" }),
    }),
  startTask: (grantId: string) =>
    req<{ task: RemediationTask }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ grantId, mode: "REMEDIATE" }),
    }),
  runTask: (id: string, selectedFindingId?: string) =>
    req<{ task: RemediationTask; audit: AuditEvent[]; brain: BrainMap }>(`/api/tasks/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ selectedFindingId }),
    }),
  getTask: (id: string) =>
    req<{ task: RemediationTask; audit: AuditEvent[]; brain: BrainMap }>(`/api/tasks/${id}`),
};
