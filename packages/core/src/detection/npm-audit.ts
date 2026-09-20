import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { AuthorizationGrant, Finding } from "@uatu/domain";
import type { AuthorizationPolicy } from "../policy.js";
import { runCommand } from "../command-runner.js";

export interface NpmAuditOptions {
  repoPath: string;
  policy: AuthorizationPolicy;
  grant?: AuthorizationGrant;
  neuronIds: string[];
  timeoutMs?: number;
}

interface AuditVia {
  source?: number;
  name?: string;
  dependency?: string;
  title?: string;
  url?: string;
  severity?: string;
  range?: string;
}

interface AuditVuln {
  name: string;
  severity: string;
  isDirect?: boolean;
  via: Array<string | AuditVia>;
  range?: string;
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
}

interface AuditReport {
  vulnerabilities?: Record<string, AuditVuln>;
}

function severityRank(sev: string): Finding["severity"] {
  const s = sev.toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "moderate" || s === "medium") return "medium";
  return "low";
}

function confidenceFromSeverity(sev: Finding["severity"]): number {
  switch (sev) {
    case "critical":
      return 0.95;
    case "high":
      return 0.9;
    case "medium":
      return 0.8;
    default:
      return 0.7;
  }
}

function pickAdvisory(via: Array<string | AuditVia>): AuditVia | undefined {
  const objects = via.filter((v): v is AuditVia => typeof v === "object" && v !== null);
  if (!objects.length) return undefined;
  const rank = (s?: string) => {
    const x = (s ?? "").toLowerCase();
    if (x === "critical") return 4;
    if (x === "high") return 3;
    if (x === "moderate" || x === "medium") return 2;
    return 1;
  };
  return objects.sort((a, b) => rank(b.severity) - rank(a.severity))[0];
}

function fixedVersionFrom(vuln: AuditVuln): string | undefined {
  if (typeof vuln.fixAvailable === "object" && vuln.fixAvailable?.version) {
    return vuln.fixAvailable.version;
  }
  return undefined;
}

async function readManifestVersions(repoPath: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(path.join(repoPath, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return {};
  }
}

/**
 * Run `npm audit --json` and map advisories to dependency_security findings.
 * Detection may install deps with --ignore-scripts first (no lifecycle scripts).
 * Remediation installs that need scripts stay on the patch path (see general-patch).
 */
export async function detectNpmAuditFindings(options: NpmAuditOptions): Promise<Finding[]> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const manifest = await readManifestVersions(options.repoPath);

  // Prefer a scripts-disabled install so audit can resolve the tree without running package lifecycle hooks.
  try {
    await access(path.join(options.repoPath, "node_modules"));
  } catch {
    await runCommand("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: options.repoPath,
      policy: options.policy,
      grant: options.grant,
      timeoutMs: Math.max(timeoutMs, 60_000),
      maxOutputBytes: 256_000,
    });
  }

  const result = await runCommand("npm", ["audit", "--json"], {
    cwd: options.repoPath,
    policy: options.policy,
    grant: options.grant,
    timeoutMs,
    maxOutputBytes: 512_000,
  });

  if (result.timedOut) {
    throw new Error("npm audit timed out");
  }

  // npm audit exits non-zero when vulns exist; still parse stdout JSON.
  const raw = result.stdout.trim();
  if (!raw) {
    if (result.exitCode !== 0 && result.stderr) {
      throw new Error(`npm audit failed: ${result.stderr.slice(0, 400)}`);
    }
    return [];
  }

  let report: AuditReport;
  try {
    report = JSON.parse(raw) as AuditReport;
  } catch {
    throw new Error("npm audit returned non-JSON output");
  }

  const now = new Date().toISOString();
  const findings: Finding[] = [];
  const vulns = report.vulnerabilities ?? {};

  for (const [pkgName, vuln] of Object.entries(vulns)) {
    const advisory = pickAdvisory(vuln.via ?? []);
    const fixedVersion = fixedVersionFrom(vuln);
    if (!fixedVersion) continue;

    const severity = severityRank(vuln.severity || advisory?.severity || "medium");
    const advisoryId =
      advisory?.url?.match(/GHSA-[\w-]+/i)?.[0] ??
      (advisory?.source != null ? `npm:${advisory.source}` : `npm:${pkgName}`);
    const installedVersion = manifest[pkgName] ?? vuln.range ?? "unknown";

    findings.push({
      id: randomUUID(),
      kind: "dependency_security",
      title: `${pkgName}: ${advisory?.title ?? "known vulnerability"}`,
      summary: `npm audit reports ${severity} severity for ${pkgName}@${installedVersion}; fix available at ${fixedVersion}`,
      severity,
      confidence: {
        value: confidenceFromSeverity(severity),
        rationale: `npm audit severity=${severity}`,
      },
      evidence: [
        {
          id: randomUUID(),
          kind: "dependency",
          summary: advisory?.title ?? `${pkgName} vulnerable`,
          path: "package.json",
          excerpt: advisory?.url ?? advisoryId,
          confidence: { value: 0.95, rationale: "npm audit advisory" },
          observedAt: now,
        },
      ],
      relatedNeuronIds: options.neuronIds.slice(0, 8),
      pathHints: ["package.json"],
      remediationHint: {
        packageName: pkgName,
        installedVersion,
        fixedVersion,
        advisoryId,
      },
    });
  }

  return findings;
}
