/**
 * Phase 2 mode verification harness (not part of package tests).
 * Usage: node --import tsx scripts/verify-detection-modes.ts
 */
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AuditTrail, AuthorizationPolicy, JsonFileStore, WorkflowOrchestrator } from "@uatu/core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const seedFixture = path.join(root, "fixtures", "demo-vulnerable");

async function prepFixture(): Promise<{ tmp: string; fixture: string; orchestrator: WorkflowOrchestrator; audit: AuditTrail }> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "uatu-mode-"));
  const fixture = path.join(tmp, "fixture");
  await cp(seedFixture, fixture, { recursive: true });
  const rangePath = path.join(fixture, "src", "range.js");
  let src = await readFile(rangePath, "utf8");
  src = src.replace(/i <= end/, "i < end");
  await writeFile(rangePath, src, "utf8");
  const pkgPath = path.join(fixture, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies: Record<string, string>;
  };
  pkg.dependencies["left-pad"] = "1.0.1";
  pkg.dependencies["minimist"] = "0.0.8";
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  const git = (args: string[]) =>
    spawnSync("git", args, {
      cwd: fixture,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CEILING_DIRECTORIES: path.dirname(fixture),
        GIT_AUTHOR_NAME: "UATU",
        GIT_AUTHOR_EMAIL: "uatu@test",
        GIT_COMMITTER_NAME: "UATU",
        GIT_COMMITTER_EMAIL: "uatu@test",
      },
    });
  git(["init", "-b", "main"]);
  git(["add", "."]);
  git(["commit", "-m", "seed"]);

  const store = new JsonFileStore(path.join(tmp, "data"));
  const audit = new AuditTrail();
  const policy = new AuthorizationPolicy(fixture);
  const orchestrator = new WorkflowOrchestrator({ policy, store, audit, fixturePath: fixture });
  return { tmp, fixture, orchestrator, audit };
}

async function runMode(mode: string) {
  process.env.UATU_DETECTION_MODE = mode;
  const { tmp, orchestrator, audit } = await prepFixture();
  try {
    const grant = await orchestrator.createGrant({ grantedBy: "mode-test" });
    let task = await orchestrator.startRun(grant.id);
    task = await orchestrator.advance(task.id);
    const detection = audit.all().filter((e) => e.action === "detection_completed");
    const modeUsed = detection[0]?.metadata?.detection_mode_used;
    const titles = task.findings.map((f) => f.title);
    const hasRemediationHint = task.findings.some((f) => !!f.remediationHint);
    const hasLeftPadFixture = task.findings.some((f) => f.title.includes("left-pad"));
    const hasMinimistAudit = task.findings.some(
      (f) => f.remediationHint?.packageName === "minimist" || /minimist/i.test(f.title),
    );

    let finalState: string | undefined;
    if (mode === "fixture" || mode === "auto") {
      task = await orchestrator.runToCompletion(task.id);
      finalState = task.state;
    }

    return {
      mode,
      modeUsed,
      findingCount: task.findings.length,
      titles,
      hasRemediationHint,
      hasLeftPadFixture,
      hasMinimistAudit,
      finalState,
      detectionDetail: detection[0]?.detail,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await runMode("fixture");
  assert.equal(fixture.modeUsed, "fixture");
  assert.equal(fixture.hasLeftPadFixture, true);
  assert.equal(fixture.hasMinimistAudit, false);
  assert.equal(fixture.finalState, "PR_ARTIFACT_READY");

  const general = await runMode("general");
  assert.equal(general.modeUsed, "general");
  assert.equal(general.hasMinimistAudit, true);
  assert.equal(general.hasRemediationHint, true);
  assert.equal(general.hasLeftPadFixture, false);

  const auto = await runMode("auto");
  assert.ok(auto.modeUsed === "general" || auto.modeUsed === "fixture");
  assert.equal(auto.finalState, "PR_ARTIFACT_READY");
  assert.ok(auto.detectionDetail?.includes("detection_mode_used="));

  console.log(JSON.stringify({ fixture, general, auto }, null, 2));
  console.log("verify-detection-modes: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
