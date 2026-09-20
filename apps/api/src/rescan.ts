/**
 * Local polling fallback for scheduled rescans (Phase F).
 * Cloud path: EventBridge → SQS → worker with type scheduled_rescan.
 */
import type { AuthorizationGrant, RemediationTask } from "@uatu/domain";
import type { WorkflowOrchestrator } from "@uatu/core";
import type { GrantStore, TaskStore, AuditStore } from "@uatu/core";
import type { AuditTrail } from "@uatu/core";

export interface RescanSchedulerDeps {
  store: GrantStore & TaskStore & AuditStore;
  orchestrator: WorkflowOrchestrator;
  audit: AuditTrail;
  intervalMs?: number;
}

export interface RescanResult {
  started: number;
  skipped: number;
  taskIds: string[];
}

/**
 * Start a fresh remediation run for each active grant (fixture or github).
 * Skips grants that already have an in-flight task.
 */
export async function runScheduledRescans(deps: {
  store: GrantStore & TaskStore & AuditStore;
  orchestrator: WorkflowOrchestrator;
  audit: AuditTrail;
  userId?: string;
}): Promise<RescanResult> {
  const grants = await deps.store.listGrants();
  const tasks = await deps.store.listTasks();
  const inFlight = new Set(
    tasks
      .filter((t) => !isTerminalTask(t))
      .map((t) => t.grantId)
      .filter((id): id is string => Boolean(id)),
  );

  const result: RescanResult = { started: 0, skipped: 0, taskIds: [] };
  for (const grant of grants) {
    if (deps.userId && grant.userId && grant.userId !== deps.userId) continue;
    if (inFlight.has(grant.id)) {
      result.skipped += 1;
      continue;
    }
    try {
      const mode = grant.scope === "security-research" ? "SECURITY" : "REMEDIATE";
      const task = await deps.orchestrator.startRun(grant.id, mode);
      result.started += 1;
      result.taskIds.push(task.id);
      deps.audit.append({
        taskId: task.id,
        actor: "scheduler",
        action: "scheduled_rescan_started",
        detail: `Rescan for grant ${grant.repositoryName}`,
        metadata: { userId: grant.userId, grantId: grant.id, source: "scheduled_rescan" },
      });
    } catch {
      result.skipped += 1;
    }
  }
  await deps.store.saveEvents(deps.audit.all());
  return result;
}

/** Best-effort local interval; no-op when UATU_RESCAN_POLL_MS is unset or below 60s. */
export function startLocalRescanPolling(deps: RescanSchedulerDeps): () => void {
  const ms = deps.intervalMs ?? Number(process.env.UATU_RESCAN_POLL_MS ?? "0");
  if (!Number.isFinite(ms) || ms < 60_000) {
    return () => undefined;
  }
  const timer = setInterval(() => {
    void runScheduledRescans(deps).catch(() => undefined);
  }, ms);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function isTerminalTask(task: RemediationTask): boolean {
  return ["PR_CREATED", "PR_ARTIFACT_READY", "OUT_OF_SCOPE", "BLOCKED"].includes(task.state);
}

export function grantNeedsSecurityScope(grant: AuthorizationGrant): boolean {
  return grant.scope === "security-research" || grant.capabilities.includes("security_research");
}
