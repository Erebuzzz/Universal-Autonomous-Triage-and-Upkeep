/**
 * Phase B acceptance: clone 2–3 public OSS repos into sandbox and run generalDetect.
 * Usage: node --import tsx apps/api/src/verify-oss-detection.ts
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AuthorizationPolicy, generalDetect } from "@uatu/core";
import type { AuthorizationGrant } from "@uatu/domain";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sandboxRoot = path.join(root, "data", "sandbox", "oss-acceptance");

/** Small public repos; prefer shallow clones + ignore-scripts installs. */
const REPOS: Array<{ name: string; url: string }> = [
  { name: "minimist", url: "https://github.com/minimistjs/minimist.git" },
  { name: "ms", url: "https://github.com/vercel/ms.git" },
  { name: "debug", url: "https://github.com/debug-js/debug.git" },
];

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) },
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
}

function npm(cwd: string, args: string[]) {
  return spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 180_000,
    env: { ...process.env, NODE_ENV: "development" },
  });
}

function makeGrant(targetPath: string, repoName: string): AuthorizationGrant {
  return {
    id: `oss-${repoName}`,
    targetPath,
    repositoryName: repoName,
    capabilities: [
      "inspect",
      "analyze",
      "run_tests",
      "write_files",
      "create_branch",
      "commit",
      "draft_pr",
    ],
    pathAllowlist: ["**"],
    commandAllowlist: [
      "node",
      "npm",
      "npm test",
      "npm run test",
      "npm audit",
      "npm install",
      "npx",
      "git",
    ],
    grantedBy: "oss-acceptance",
    grantedAt: new Date().toISOString(),
    notes: "Temporary OSS clone under sandbox policy",
  };
}

async function prepareRepo(spec: (typeof REPOS)[number]): Promise<string> {
  const dest = path.join(sandboxRoot, spec.name);
  await rm(dest, { recursive: true, force: true });
  await mkdir(sandboxRoot, { recursive: true });
  git(sandboxRoot, ["clone", "--depth", "1", "--single-branch", spec.url, spec.name]);
  const install = npm(dest, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"]);
  if (install.status !== 0) {
    console.warn(
      `[warn] npm install failed for ${spec.name}: ${(install.stderr || install.stdout).slice(0, 300)}`,
    );
  }
  return dest;
}

async function main() {
  process.env.UATU_DETECTION_MODE = "general";
  process.env.UATU_BEDROCK_ENABLED = process.env.UATU_BEDROCK_ENABLED ?? "false";
  const report: Array<Record<string, unknown>> = [];

  for (const spec of REPOS) {
    console.log(`\n=== Cloning ${spec.name} ===`);
    const repoPath = await prepareRepo(spec);
    const policy = new AuthorizationPolicy(repoPath);
    policy.grantTemporaryRoot(repoPath);
    const grant = makeGrant(repoPath, spec.name);
    const findings = await generalDetect({
      repoPath,
      policy,
      grant,
      neuronIds: ["n1"],
    });

    const summary = findings.slice(0, 8).map((f) => ({
      kind: f.kind,
      title: f.title,
      severity: f.severity,
      evidence: f.evidence.slice(0, 2).map((e) => ({
        kind: e.kind,
        path: e.path,
        excerpt: (e.excerpt ?? e.summary).slice(0, 160),
      })),
      remediationHint: f.remediationHint,
      hasProposedDiff: Boolean(f.proposedDiff),
    }));

    console.log(`Findings for ${spec.name}: ${findings.length}`);
    for (const f of summary) {
      console.log(` - [${f.severity}] ${f.title}`);
      for (const e of f.evidence) {
        console.log(`    evidence: ${e.kind} ${e.path ?? ""} :: ${e.excerpt}`);
      }
    }

    report.push({
      repo: spec.name,
      url: spec.url,
      findingCount: findings.length,
      sample: summary,
    });
  }

  const outPath = path.join(sandboxRoot, "DETECTION_REPORT.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nWrote ${outPath}`);

  const withEvidence = report.filter((r) => (r.findingCount as number) > 0);
  if (withEvidence.length < 1) {
    console.error("ACCEPTANCE FAIL: expected at least one OSS repo with real findings");
    process.exit(1);
  }
  console.log(`ACCEPTANCE OK: ${withEvidence.length}/${REPOS.length} repos produced non-empty findings`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
