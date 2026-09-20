/**
 * Phase C acceptance: full detect→patch→verify loop on one non-fixture OSS clone.
 * Prefers a dependency_security finding with remediationHint; falls back to fixture-like
 * only if no OSS dep finding is remediable (then exits non-zero for C).
 *
 * Usage: node --import tsx apps/api/src/verify-oss-patch-loop.ts
 */
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  AuditTrail,
  AuthorizationPolicy,
  JsonFileStore,
  WorkflowOrchestrator,
} from "@uatu/core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sandboxRoot = path.join(root, "data", "sandbox", "oss-patch-loop");

function run(cwd: string, cmd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32" && (cmd === "npm" || cmd === "npx"),
    env: {
      ...process.env,
      GIT_CEILING_DIRECTORIES: path.dirname(cwd),
      GIT_AUTHOR_NAME: "UATU",
      GIT_AUTHOR_EMAIL: "uatu@local",
      GIT_COMMITTER_NAME: "UATU",
      GIT_COMMITTER_EMAIL: "uatu@local",
    },
  });
}

async function prepareVulnerableOssClone(): Promise<string> {
  await rm(sandboxRoot, { recursive: true, force: true });
  await mkdir(sandboxRoot, { recursive: true });
  const dest = path.join(sandboxRoot, "minimist-vuln");
  const clone = run(sandboxRoot, "git", [
    "clone",
    "--depth",
    "1",
    "https://github.com/minimistjs/minimist.git",
    "minimist-vuln",
  ]);
  if (clone.status !== 0) {
    throw new Error(`clone failed: ${clone.stderr || clone.stdout}`);
  }

  // Pin a historically vulnerable direct dependency via a tiny wrapper package so
  // npm audit yields a remediable finding with real advisory evidence.
  const pkg = {
    name: "uatu-oss-patch-target",
    version: "1.0.0",
    private: true,
    type: "commonjs",
    scripts: { test: "node -e \"require('minimist'); console.log('ok')\"" },
    dependencies: {
      minimist: "0.0.8",
    },
  };
  await writeFile(path.join(dest, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
  // Keep upstream sources for static analysis; refresh lock for the pinned vuln.
  // Patch-loop setup needs a real install (scripts OK here); detection paths use --ignore-scripts.
  const install = run(dest, "npm", ["install", "--no-fund", "--no-audit"]);
  if (install.status !== 0) {
    throw new Error(`npm install failed: ${install.stderr || install.stdout}`);
  }

  run(dest, "git", ["add", "-A"]);
  run(dest, "git", ["commit", "-m", "chore: pin vulnerable minimist for UATU acceptance"]);
  return dest;
}

async function main() {
  process.env.UATU_DETECTION_MODE = "general";
  process.env.UATU_BEDROCK_ENABLED = process.env.UATU_BEDROCK_ENABLED ?? "false";

  const fixturePath = await prepareVulnerableOssClone();
  const dataDir = path.join(sandboxRoot, "data");
  await mkdir(dataDir, { recursive: true });

  const store = new JsonFileStore(dataDir);
  const audit = new AuditTrail();
  const policy = new AuthorizationPolicy(fixturePath);
  policy.grantTemporaryRoot(fixturePath);
  const orchestrator = new WorkflowOrchestrator({
    policy,
    store,
    audit,
    fixturePath,
    repositoryId: "oss-minimist-vuln",
  });

  const grant = await orchestrator.createGrant({ grantedBy: "phase-c-acceptance" });
  let task = await orchestrator.startRun(grant.id);
  task = await orchestrator.advance(task.id);

  const dep = task.findings.find((f) => f.kind === "dependency_security" && f.remediationHint);
  if (!dep) {
    console.error("No remediable dependency_security finding on OSS clone");
    console.error(JSON.stringify(task.findings.map((f) => f.title), null, 2));
    process.exit(1);
  }

  console.log(`Selected finding: ${dep.title}`);
  console.log(`Remediation: ${dep.remediationHint!.packageName}@${dep.remediationHint!.fixedVersion}`);

  task = await orchestrator.runToCompletion(task.id, dep.id);
  console.log(`Final state: ${task.state}`);
  console.log(`Verification: ${task.verification?.passed}`);
  console.log(`Changed files: ${task.patch?.changedFiles?.join(", ")}`);

  const decisions = audit.all().filter((e) => e.action === "agent_decision");
  console.log(`Agent decisions logged: ${decisions.length}`);
  for (const d of decisions.slice(0, 6)) {
    console.log(` - ${d.detail}`);
  }

  const pkg = JSON.parse(await readFile(path.join(fixturePath, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const ver = pkg.dependencies?.minimist;
  console.log(`package.json minimist => ${ver}`);

  const ok =
    task.verification?.passed === true &&
    (task.state === "PR_ARTIFACT_READY" || task.state === "PR_CREATED" || task.state === "MEMORY_UPDATED" || task.state === "READY_FOR_PR" || task.state === "REVIEWING") &&
    Boolean(ver && ver !== "0.0.8");

  // Accept PR_ARTIFACT_READY as success for local-only.
  const success =
    task.verification?.passed === true &&
    (task.state === "PR_ARTIFACT_READY" || task.state === "PR_CREATED") &&
    Boolean(ver && !String(ver).includes("0.0.8"));

  if (!success) {
    console.error("PHASE C ACCEPTANCE FAIL", { state: task.state, ver, ok });
    process.exit(1);
  }
  console.log("PHASE C ACCEPTANCE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
