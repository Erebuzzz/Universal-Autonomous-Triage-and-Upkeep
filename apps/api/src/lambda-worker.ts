import type { SQSHandler } from "aws-lambda";
import { buildAppContext } from "./http-app.js";

interface JobMessage {
  type: "run_to_completion" | "advance";
  taskId: string;
  selectedFindingId?: string;
}

export const handler: SQSHandler = async (event) => {
  const ctx = await buildAppContext();
  for (const record of event.Records) {
    const job = JSON.parse(record.body) as JobMessage;
    console.log(JSON.stringify({ type: "uatu-worker", job }));

    if (job.type === "advance") {
      await ctx.orchestrator.advance(job.taskId, job.selectedFindingId);
      continue;
    }

    if (job.type === "run_to_completion") {
      const task = await ctx.orchestrator.runToCompletion(job.taskId, job.selectedFindingId);
      if (task.prArtifact?.body) {
        await ctx.store.put(
          `artifacts/${task.id}/pr.md`,
          task.prArtifact.body,
          "text/markdown",
        );
      }
      continue;
    }

    console.warn("Unknown job type", job);
  }
  return;
};
