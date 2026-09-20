import { createAppServices } from "./services.js";

async function demo() {
  const { orchestrator, audit, fixturePath } = await createAppServices();
  console.log("=== UATU local demo ===");
  console.log("Sandbox fixture:", fixturePath);

  const grant = await orchestrator.createGrant({
    grantedBy: "demo-operator",
    notes: "Authorize demo-vulnerable fixture for Ship It MVP",
  });
  console.log("Grant:", grant.id);

  let task = await orchestrator.startRun(grant.id, "REMEDIATE");
  console.log("Task:", task.id, task.state);

  task = await orchestrator.runToCompletion(task.id);
  console.log("Final state:", task.state);
  console.log("Selected:", task.selectedFindingId);
  console.log("Patch:", task.patch);
  console.log("Verification:", task.verification?.passed);
  console.log("PR title:", task.prArtifact?.title);
  console.log("Audit events:", audit.forTask(task.id).length);

  if (task.state !== "PR_ARTIFACT_READY" || !task.verification?.passed) {
    console.error("Demo did not complete successfully");
    console.error("Verification checks:", task.verification?.checks);
    process.exit(1);
  }
  console.log("Demo OK");
}

demo().catch((err) => {
  console.error(err);
  process.exit(1);
});
