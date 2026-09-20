/** Schema version for persisted brain / task documents. */
export const SCHEMA_VERSION = 1 as const;

export type OperatingMode =
  | "PASSIVE"
  | "RESEARCH"
  | "TRIAGE"
  | "MAINTAIN"
  | "SECURITY"
  | "REMEDIATE"
  | "WATCH";

export type Capability =
  | "inspect"
  | "analyze"
  | "run_tests"
  | "write_files"
  | "create_branch"
  | "commit"
  | "draft_pr";

export type TaskState =
  | "DISCOVERED"
  | "TRIAGED"
  | "SELECTED"
  | "MEMORY_CONTEXT_LOADED"
  | "INVESTIGATING"
  | "ROOT_CAUSE_VERIFIED"
  | "IMPLEMENTING"
  | "TESTING"
  | "MEMORY_UPDATED"
  | "REVIEWING"
  | "READY_FOR_PR"
  | "PR_ARTIFACT_READY"
  | "BLOCKED"
  | "NEEDS_HUMAN"
  | "VERIFICATION_FAILED"
  | "LOW_CONFIDENCE"
  | "OUT_OF_SCOPE"
  | "MEMORY_CONFLICT";

export const LEGAL_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  DISCOVERED: ["TRIAGED", "BLOCKED", "OUT_OF_SCOPE"],
  TRIAGED: ["SELECTED", "BLOCKED", "NEEDS_HUMAN", "LOW_CONFIDENCE"],
  SELECTED: ["MEMORY_CONTEXT_LOADED", "BLOCKED"],
  MEMORY_CONTEXT_LOADED: ["INVESTIGATING", "MEMORY_CONFLICT", "BLOCKED"],
  INVESTIGATING: ["ROOT_CAUSE_VERIFIED", "NEEDS_HUMAN", "LOW_CONFIDENCE", "BLOCKED"],
  ROOT_CAUSE_VERIFIED: ["IMPLEMENTING", "NEEDS_HUMAN", "BLOCKED"],
  IMPLEMENTING: ["TESTING", "BLOCKED", "NEEDS_HUMAN"],
  TESTING: ["MEMORY_UPDATED", "VERIFICATION_FAILED", "BLOCKED"],
  MEMORY_UPDATED: ["REVIEWING", "BLOCKED"],
  REVIEWING: ["READY_FOR_PR", "NEEDS_HUMAN", "BLOCKED"],
  READY_FOR_PR: ["PR_ARTIFACT_READY", "BLOCKED"],
  PR_ARTIFACT_READY: [],
  BLOCKED: ["DISCOVERED", "TRIAGED", "SELECTED"],
  NEEDS_HUMAN: ["SELECTED", "INVESTIGATING", "IMPLEMENTING"],
  VERIFICATION_FAILED: ["IMPLEMENTING", "NEEDS_HUMAN", "BLOCKED"],
  LOW_CONFIDENCE: ["SELECTED", "NEEDS_HUMAN", "OUT_OF_SCOPE"],
  OUT_OF_SCOPE: [],
  MEMORY_CONFLICT: ["MEMORY_CONTEXT_LOADED", "NEEDS_HUMAN", "BLOCKED"],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export type MemoryStatus =
  | "ACTIVE"
  | "UNCERTAIN"
  | "STALE"
  | "CONTRADICTED"
  | "ARCHIVED"
  | "VERIFIED";

export type NeuronKind =
  | "Repository"
  | "File"
  | "Directory"
  | "Dependency"
  | "Test"
  | "Bug"
  | "SecurityFinding"
  | "Patch"
  | "VerificationResult"
  | "Observation"
  | "Hypothesis"
  | "Issue";

export type EdgeKind =
  | "CONTAINS"
  | "DEPENDS_ON"
  | "AFFECTS"
  | "RELATED_TO"
  | "FIXES"
  | "VERIFIED_BY"
  | "TESTED_BY"
  | "LOCATED_IN"
  | "CAUSED_BY"
  | "DERIVED_FROM";

export interface Confidence {
  value: number;
  rationale: string;
}

export interface Evidence {
  id: string;
  kind: "file" | "test" | "command" | "dependency" | "diff" | "policy";
  summary: string;
  path?: string;
  excerpt?: string;
  confidence: Confidence;
  observedAt: string;
}

export interface AuthorizationGrant {
  id: string;
  targetPath: string;
  repositoryName: string;
  capabilities: Capability[];
  pathAllowlist: string[];
  commandAllowlist: string[];
  grantedBy: string;
  grantedAt: string;
  notes?: string;
}

export interface Neuron {
  id: string;
  kind: NeuronKind;
  label: string;
  status: MemoryStatus;
  confidence: Confidence;
  importance: number;
  recency: string;
  payload: Record<string, unknown>;
  evidenceIds: string[];
}

export interface Synapse {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  confidence: Confidence;
  status: MemoryStatus;
  lastObserved: string;
  evidenceIds: string[];
}

export interface BrainGraph {
  schemaVersion: typeof SCHEMA_VERSION;
  repositoryId: string;
  neurons: Neuron[];
  synapses: Synapse[];
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  taskId: string;
  at: string;
  actor: string;
  action: string;
  fromState?: TaskState;
  toState?: TaskState;
  detail: string;
  redacted: boolean;
  metadata?: Record<string, unknown>;
}

export type FindingKind = "functional_bug" | "dependency_security";

export interface Finding {
  id: string;
  kind: FindingKind;
  title: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: Confidence;
  evidence: Evidence[];
  relatedNeuronIds: string[];
  pathHints: string[];
}

export interface PatchPlan {
  findingId: string;
  files: Array<{ path: string; description: string }>;
  branchName: string;
  commitMessage: string;
  regressionTestPath?: string;
}

export interface PatchResult {
  applied: boolean;
  branchName: string;
  commitSha?: string;
  changedFiles: string[];
  diffSummary: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
  confidence: Confidence;
  blockedReasons: string[];
}

export interface PrReadyArtifact {
  title: string;
  body: string;
  branchName: string;
  baseBranch: string;
  changedFiles: string[];
  commitMessage: string;
  verificationPassed: boolean;
  localOnly: true;
}

export interface RemediationTask {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  repositoryPath: string;
  grantId?: string;
  state: TaskState;
  mode: OperatingMode;
  selectedFindingId?: string;
  findings: Finding[];
  patch?: PatchResult;
  verification?: VerificationResult;
  prArtifact?: PrReadyArtifact;
  createdAt: string;
  updatedAt: string;
}

export interface BrainMapNode {
  id: string;
  kind: NeuronKind;
  label: string;
  status: MemoryStatus;
  confidence: number;
  x?: number;
  y?: number;
}

export interface BrainMapEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  confidence: number;
}

export interface BrainMapPayload {
  nodes: BrainMapNode[];
  edges: BrainMapEdge[];
  activatedIds: string[];
}
