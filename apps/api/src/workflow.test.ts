import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, before, after } from "node:test";
import { spawnSync } from "node:child_process";
import { AuditTrail, AuthorizationPolicy, JsonFileStore, WorkflowOrchestrator } from "@uatu/core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const seedFixture = path.join(root, "fixtures", "demo-vulnerable");

describe("workflow integration", () => {
  let tmp: string;
  let fixture: string;
  let orchestrator: WorkflowOrchestrator;

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "uatu-"));
    fixture = path.join(tmp, "fixture");
    await cp(seedFixture, fixture, { recursive: true });
    // Reset range.js to buggy state in case prior demos mutated the seed.
    const rangePath = path.join(fixture, "src", "range.js");
    let src = await readFile(rangePath, "utf8");
    src = src.replace(/i <= end/, "i < end");
    await writeFile(rangePath, src, "utf8");
    const pkgPath = path.join(fixture, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      dependencies: Record<string, string>;
    };
    pkg.dependencies["left-pad"] = "1.0.1";
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

    const git = (args: string[]) =>
      spawnSync("git", args, {
        cwd: fixture,
        encoding: "utf8",
        shell: false,
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
    orchestrator = new WorkflowOrchestrator({ policy, store, audit, fixturePath: fixture });
  });

  after(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("completes functional remediation with PR artifact", async () => {
    const grant = await orchestrator.createGrant({ grantedBy: "test" });
    let task = await orchestrator.startRun(grant.id);
    task = await orchestrator.runToCompletion(task.id);
    assert.equal(task.state, "PR_ARTIFACT_READY");
    assert.equal(task.verification?.passed, true);
    assert.ok(task.prArtifact?.localOnly);
    assert.ok(task.patch?.branchName.startsWith("uatu/"));
  });

  it("denies writes without grant", async () => {
    await assert.rejects(
      async () => orchestrator.startRun("missing-grant"),
      /Unknown grant|policy/i,
    );
  });
});
