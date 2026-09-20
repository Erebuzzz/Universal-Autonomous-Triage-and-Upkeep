import type { SQSHandler } from "aws-lambda";
import { buildAppContext } from "./http-app.js";

interface JobMessage {
  type: "run_to_completion" | "advance" | "scheduled_rescan";
  taskId?: string;
  selectedFindingId?: string;
  /** Enqueuing user: must match task.userId before work runs. */
  userId?: string;
  modelPreference?: string;
}

export const handler: SQSHandler = async (event) => {
  const ctx = await buildAppContext();
  for (const record of event.Records) {
    const job = JSON.parse(record.body) as JobMessage;
    console.log(JSON.stringify({ type: "uatu-worker", job: { ...job } }));

    if (job.type === "scheduled_rescan") {
      const { runScheduledRescans } = await import("./rescan.js");
      const result = await runScheduledRescans({
        store: ctx.store,
        orchestrator: ctx.orchestrator,
        audit: ctx.audit,
        userId: job.userId,
      });
      console.log(JSON.stringify({ type: "uatu-scheduled-rescan", result }));
      continue;
    }

    if (!job.taskId) {
      console.error(JSON.stringify({ type: "uatu-worker-reject", reason: "missing_task_id" }));
      continue;
    }

    const task = await ctx.store.getTask(job.taskId);
    if (!task) {
      console.error(JSON.stringify({ type: "uatu-worker-reject", reason: "task_not_found", taskId: job.taskId }));
      continue;
    }
    if (!job.userId || !task.userId || job.userId !== task.userId) {
      console.error(
        JSON.stringify({
          type: "uatu-worker-reject",
          reason: "user_mismatch",
          taskId: job.taskId,
          jobUserId: job.userId ?? null,
          taskUserId: task.userId ?? null,
        }),
      );
      continue;
    }

    if (job.type === "advance") {
      await ctx.orchestrator.advance(job.taskId, job.selectedFindingId, job.modelPreference);
      continue;
    }

    if (job.type === "run_to_completion") {
      const completed = await ctx.orchestrator.runToCompletion(
        job.taskId,
        job.selectedFindingId,
        job.modelPreference,
      );
      if (completed.prArtifact?.body) {
        await ctx.store.put(
          `artifacts/${completed.id}/pr.md`,
          completed.prArtifact.body,
          "text/markdown",
        );
      }
      continue;
    }

    console.warn("Unknown job type", job);
  }
  return;
};
