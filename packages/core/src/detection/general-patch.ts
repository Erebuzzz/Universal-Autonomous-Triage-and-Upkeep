import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { AuthorizationGrant, Finding } from "@uatu/domain";
import type { AuthorizationPolicy } from "../policy.js";
import { runCommand } from "../command-runner.js";
import { decideWithOptionalLlm } from "../llm.js";
import { applyUnifiedDiff, DiffApplyError } from "./apply-unified-diff.js";

function extractUnifiedDiff(text: string): string | undefined {
  const trimmed = text.trim();
  const fenceDiff = trimmed.match(/```diff\s*([\s\S]*?)```/);
  if (fenceDiff?.[1]?.trim()) return fenceDiff[1].trim();
  const fenceJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceJson?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(candidate.slice(start, end + 1)) as { unifiedDiff?: string };
      if (obj.unifiedDiff?.trim()) return obj.unifiedDiff.trim();
    } catch {
      /* fall through */
    }
  }
  if (trimmed.includes("@@ ") && (trimmed.includes("--- ") || trimmed.includes("diff --git"))) {
    return trimmed;
  }
  return undefined;
}

export async function applyDependencyRemediation(
  repoPath: string,
  finding: Finding,
  opts?: {
    policy?: AuthorizationPolicy;
    grant?: AuthorizationGrant;
  },
): Promise<string[]> {
  const hint = finding.remediationHint;
  if (!hint) {
    throw new Error("Missing remediationHint for general dependency patch");
  }

  if (opts?.grant && opts.policy) {
    opts.policy.assertPathAllowed(opts.grant, "package.json");
  }

  const pkgPath = path.join(repoPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const changed: string[] = [];
  let bumped = false;
  for (const section of ["dependencies", "devDependencies"] as const) {
    const deps = pkg[section];
    if (deps && hint.packageName in deps) {
      deps[hint.packageName] = hint.fixedVersion;
      bumped = true;
    }
  }
  if (!bumped) {
    pkg.dependencies = pkg.dependencies ?? {};
    pkg.dependencies[hint.packageName] = hint.fixedVersion;
  }

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  changed.push("package.json");

  const note = path.join(repoPath, "SECURITY_NOTE.md");
  if (opts?.grant && opts.policy) {
    opts.policy.assertPathAllowed(opts.grant, "SECURITY_NOTE.md");
  }
  await writeFile(
    note,
    [
      `# Security remediation`,
      ``,
      `Bumped \`${hint.packageName}\` from ${hint.installedVersion} to ${hint.fixedVersion}.`,
      ``,
      `- Advisory: ${hint.advisoryId}`,
      `- Finding: ${finding.title}`,
      `- Severity: ${finding.severity}`,
      ``,
      finding.summary,
      ``,
    ].join("\n"),
    "utf8",
  );
  changed.push("SECURITY_NOTE.md");

  // Refresh lockfile in sandbox when policy/grant allow npm install.
  // Remediation may need lifecycle scripts; detection uses --ignore-scripts (see npm-audit).
  if (opts?.policy && opts.grant) {
    const install = await runCommand(
      "npm",
      ["install", `${hint.packageName}@${hint.fixedVersion}`, "--save-exact", "--no-fund", "--no-audit"],
      {
        cwd: repoPath,
        policy: opts.policy,
        grant: opts.grant,
        timeoutMs: 120_000,
        maxOutputBytes: 256_000,
      },
    );
    if (install.exitCode === 0) {
      for (const lock of ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"]) {
        try {
          opts.policy.assertPathAllowed(opts.grant, lock);
          await readFile(path.join(repoPath, lock));
          if (!changed.includes(lock)) changed.push(lock);
        } catch {
          /* lock may not exist or not allowed */
        }
      }
    }
  }

  return changed;
}

export function generalDepBranchName(finding: Finding, taskId: string): string {
  const pkg = finding.remediationHint?.packageName ?? "dep";
  const safe = pkg.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);
  return `uatu/bump-${safe}-${taskId.slice(0, 8)}`;
}

export async function applyFunctionalDiff(
  repoPath: string,
  finding: Finding,
  opts?: {
    policy?: AuthorizationPolicy;
    grant?: AuthorizationGrant;
    maxRetries?: number;
  },
): Promise<string[]> {
  const maxRetries = opts?.maxRetries ?? 2;
  let diff = finding.proposedDiff?.trim();
  if (!diff) {
    throw new Error("Missing proposedDiff for general functional patch");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const files = await applyUnifiedDiff(repoPath, diff);
      if (opts?.grant && opts.policy) {
        for (const f of files) {
          opts.policy.assertPathAllowed(opts.grant, f);
        }
      }
      return files;
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries) break;
      const reason = err instanceof DiffApplyError || err instanceof Error ? err.message : String(err);
      const retry = await decideWithOptionalLlm(
        {
          purpose: "propose_diff",
          prompt: [
            "Previous unified diff failed to apply. Produce a corrected unified diff only.",
            "Return JSON: {\"unifiedDiff\":\"...\"}",
            `Apply error: ${reason}`,
            `Prior diff:\n${diff.slice(0, 4000)}`,
            `Finding: ${finding.title}\n${finding.summary}`,
          ].join("\n\n"),
        },
        "",
      );
      if (retry.provider !== "bedrock" || !retry.text.trim()) break;
      const next = extractUnifiedDiff(retry.text);
      if (!next) break;
      diff = next;
    }
  }

  throw lastError instanceof Error ? lastError : new DiffApplyError(String(lastError));
}
