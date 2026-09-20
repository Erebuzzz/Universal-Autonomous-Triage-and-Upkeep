/**
 * API client contracts for the dashboard (Phase K).
 * Shared with the backend sibling: extend carefully; do not drop their fields.
 */
export type TaskState = string;

export interface BedrockModelDescriptor {
  id: string;
  name: string;
  provider: string;
  tier: string;
  rpm: number;
  tpm: string;
  description: string;
  modelId: string;
}

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
  remediationHint?: {
    packageName: string;
    installedVersion: string;
    fixedVersion: string;
    advisoryId: string;
  };
}

export interface RemediationTask {
  id: string;
  state: TaskState;
  findings: Finding[];
  selectedFindingId?: string;
  modelPreference?: string;
  userId?: string;
  installationId?: number;
  repositoryFullName?: string;
  source?: "fixture" | "github";
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
    localOnly?: boolean;
    prUrl?: string;
    prNumber?: number;
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
  metadata?: Record<string, unknown>;
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
  pathAllowlist?: string[];
  commandAllowlist?: string[];
  targetPath?: string;
  notes?: string;
  userId?: string;
  installationId?: number;
  repositoryFullName?: string;
  source?: "fixture" | "github";
}

export interface UatuUser {
  id: string;
  login: string;
  avatarUrl?: string;
  installationIds: number[];
}

export interface MeResponse {
  user: UatuUser;
  quota: {
    concurrentRuns: number;
    dailyRuns: number;
    monthlyRuns: number;
  };
  limits: {
    maxConcurrent: number;
    maxDaily: number;
    maxMonthly: number;
    wallClockMs: number;
  };
  githubAppConfigured: boolean;
  fixtureDemoAvailable: boolean;
}

export interface InstallationRepo {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

/** Alias for UI pickers */
export type RepoSummary = InstallationRepo;

export interface HealthStatus {
  ok: boolean;
  fixturePath?: string;
  bedrock?: boolean;
  authRequired?: boolean;
  oauthConfigured?: boolean;
  githubAppConfigured?: boolean;
  persistence?: string;
  asyncJobs?: boolean;
  service?: string;
  passiveDefault?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  get isPolicyDenied(): boolean {
    return this.status === 403 && this.code === "policy_denied";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

const base = (import.meta.env.VITE_UATU_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** Public feature flags only: never secrets. */
export const flags = {
  mockAuth: (import.meta.env.VITE_UATU_MOCK_AUTH as string | undefined) === "true",
  /** Public App slug from github.com/apps/<slug>: required for install links (no silent default). */
  githubAppSlug: (import.meta.env.VITE_UATU_GITHUB_APP_SLUG as string | undefined)?.trim() || "",
};

/** True when VITE_UATU_GITHUB_APP_SLUG is set (install deep-links are safe to show). */
export function hasGithubAppSlug(): boolean {
  return Boolean(flags.githubAppSlug);
}

export function oauthLoginUrl(): string {
  return `${base}/auth/github`;
}

export function mockLocalUser(): UatuUser {
  return {
    id: "local-demo",
    login: "local-demo",
    installationIds: [],
  };
}

export function mockMeResponse(overrides?: Partial<MeResponse>): MeResponse {
  const user = overrides?.user ?? mockLocalUser();
  return {
    user,
    quota: overrides?.quota ?? {
      concurrentRuns: 0,
      dailyRuns: 0,
      monthlyRuns: 0,
    },
    limits: overrides?.limits ?? {
      maxConcurrent: 1,
      maxDaily: 20,
      maxMonthly: 100,
      wallClockMs: 600_000,
    },
    githubAppConfigured: overrides?.githubAppConfigured ?? false,
    fixtureDemoAvailable: overrides?.fixtureDemoAvailable ?? true,
  };
}

/** Derive bedrock vs rules (and detection mode) from audit metadata. */
export function auditDecisionSource(event: AuditEvent): "bedrock" | "rules" | "detection" | null {
  const meta = event.metadata ?? {};
  if (meta.provider === "bedrock") return "bedrock";
  if (meta.provider === "rules") return "rules";
  if (typeof meta.detection_mode_used === "string") return "detection";
  if (typeof event.detail === "string") {
    if (/\bbedrock\b/i.test(event.detail)) return "bedrock";
    if (/\brules\b/i.test(event.detail) || /deterministic/i.test(event.detail)) return "rules";
  }
  return null;
}

export function simplifyModelName(modelId?: string): string {
  if (!modelId) return "Auto";
  if (modelId === "auto") return "Auto";
  if (modelId === "rules" || modelId === "rules-only") return "Rules Only";
  if (modelId.includes("nova-2-omni")) return "Nova 2 Omni";
  if (modelId.includes("nova-micro")) return "Nova Micro";
  if (modelId.includes("nova-lite")) return "Nova Lite";
  if (modelId.includes("nova-pro")) return "Nova Pro";
  if (modelId.includes("claude-3-haiku")) return "Claude 3 Haiku";
  if (modelId.includes("claude-haiku-4-5")) return "Claude Haiku 4.5";
  if (modelId.includes("claude-3-5-sonnet")) return "Claude 3.5 Sonnet";
  if (modelId.includes("claude-sonnet-4-5")) return "Claude Sonnet 4.5";
  if (modelId.includes("claude-sonnet-4-6")) return "Claude Sonnet 4.6";
  if (modelId.includes("claude-opus-4-5")) return "Claude Opus 4.5";
  if (modelId.includes("claude-opus-4-6")) return "Claude Opus 4.6";
  if (modelId.includes("llama3-2-3b") || modelId.includes("llama-3-2-3b")) return "Llama 3.2 3B";
  return modelId.replace(/^(global|apac|us)\./, "").replace(/(-v\d+:\d+|\.v\d+:\d+)$/, "");
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${url}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch (e) {
    throw new ApiError(
      e instanceof Error ? e.message : "Network error: is the API running?",
      0,
      "network",
    );
  }

  let data: T & { message?: string; error?: string } = {} as T & {
    message?: string;
    error?: string;
  };
  try {
    data = (await res.json()) as T & { message?: string; error?: string };
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    throw new ApiError(
      data.message ?? data.error ?? res.statusText ?? "Request failed",
      res.status,
      typeof data.error === "string" ? data.error : undefined,
    );
  }
  return data;
}

export const api = {
  health: () => req<HealthStatus>("/health"),
  me: () => req<MeResponse>("/api/me"),
  /** Browser navigates here for OAuth (full page). */
  githubLoginUrl: () => oauthLoginUrl(),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST", body: "{}" }),
  listModels: () => req<{ models: BedrockModelDescriptor[]; default: string }>("/api/models"),
  listInstallationRepos: (installationId: number) =>
    req<{ repos: InstallationRepo[]; message?: string }>(`/api/installations/${installationId}/repos`),
  linkInstallation: (installationId: number) =>
    req<{ user: UatuUser }>("/api/me/installations", {
      method: "POST",
      body: JSON.stringify({ installationId }),
    }),
  listGrants: () => req<{ grants: Grant[] }>("/api/grants"),
  /** Never send grantedBy: server uses session user. */
  createFixtureGrant: (notes?: string) =>
    req<{ grant: Grant }>("/api/grants", {
      method: "POST",
      body: JSON.stringify({ source: "fixture", notes: notes ?? "Dashboard fixture authorization" }),
    }),
  createGithubGrant: (input: {
    repositoryFullName: string;
    installationId: number;
    notes?: string;
  }) =>
    req<{ grant: Grant }>("/api/grants", {
      method: "POST",
      body: JSON.stringify({ source: "github", ...input }),
    }),
  /** @deprecated use createFixtureGrant: grantedBy is ignored by API */
  createGrant: (_grantedBy: string) => api.createFixtureGrant(),
  startTask: (grantId: string, mode = "REMEDIATE", modelPreference?: string) =>
    req<{ task: RemediationTask }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ grantId, mode, modelPreference }),
    }),
  advanceTask: (id: string, selectedFindingId?: string, modelPreference?: string) =>
    req<{ task: RemediationTask; audit: AuditEvent[]; brain: BrainMap; message?: string }>(
      `/api/tasks/${id}/advance`,
      { method: "POST", body: JSON.stringify({ selectedFindingId, modelPreference }) },
    ),
  runTask: (id: string, selectedFindingId?: string, modelPreference?: string) =>
    req<{ task: RemediationTask; audit: AuditEvent[]; brain: BrainMap }>(`/api/tasks/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ selectedFindingId, modelPreference }),
    }),
  getTask: (id: string) =>
    req<{ task: RemediationTask; audit: AuditEvent[]; brain: BrainMap }>(`/api/tasks/${id}`),
};
