import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { AuthorizationGrant, Finding } from "@uatu/domain";
import type { AuthorizationPolicy } from "../policy.js";
import { runCommand } from "../command-runner.js";

export interface StaticAnalysisOptions {
  repoPath: string;
  policy: AuthorizationPolicy;
  grant?: AuthorizationGrant;
  neuronIds: string[];
  maxFiles?: number;
}

interface PatternHit {
  path: string;
  line: number;
  ruleId: string;
  summary: string;
  excerpt: string;
  severity: Finding["severity"];
}

const SECURITY_PATTERNS: Array<{
  id: string;
  re: RegExp;
  summary: string;
  severity: Finding["severity"];
}> = [
  {
    id: "sec/eval",
    re: /\beval\s*\(/,
    summary: "Use of eval()",
    severity: "high",
  },
  {
    id: "sec/function-ctor",
    re: /\bnew\s+Function\s*\(/,
    summary: "Use of Function constructor",
    severity: "high",
  },
  {
    id: "sec/child-process-exec",
    re: /(?:child_process|require\(['"]child_process['"]\))[\s\S]{0,120}?\b(?:exec|execSync)\s*\(|\bexecSync\s*\(\s*['"`]/,
    summary: "child_process exec may allow command injection",
    severity: "high",
  },
  {
    id: "sec/innerHTML",
    re: /\.innerHTML\s*=/,
    summary: "Assignment to innerHTML (XSS risk)",
    severity: "medium",
  },
  {
    id: "sec/dangerouslySetInnerHTML",
    re: /dangerouslySetInnerHTML/,
    summary: "React dangerouslySetInnerHTML",
    severity: "medium",
  },
  {
    id: "sec/hardcoded-secret",
    // Require secret-like shape (long opaque string), not short test doubles.
    re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"](?![a-z]+[_-]?(?:test|dummy|fake|example|placeholder))[A-Za-z0-9_\-+/=]{20,}['"]/i,
    summary: "Possible hardcoded credential",
    severity: "critical",
  },
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "vendor",
]);

async function walkSourceFiles(root: string, maxFiles: number): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (out.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (out.length >= maxFiles) return;
      if (ent.name.startsWith(".") && ent.name !== ".env.example") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        await walk(abs);
      } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(ent.name)) {
        // Skip tests / fixtures so demo findings are not dominated by test doubles.
        if (
          /\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(ent.name) ||
          /(^|\/)(__tests__|__mocks__|fixtures|test|tests)(\/|$)/i.test(
            path.relative(root, abs).replace(/\\/g, "/"),
          )
        ) {
          continue;
        }
        out.push(abs);
      }
    }
  }
  await walk(root);
  return out;
}

function scanContent(relPath: string, content: string): PatternHit[] {
  const hits: PatternHit[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pat of SECURITY_PATTERNS) {
      if (pat.re.test(line)) {
        hits.push({
          path: relPath,
          line: i + 1,
          ruleId: pat.id,
          summary: pat.summary,
          excerpt: line.trim().slice(0, 200),
          severity: pat.severity,
        });
      }
    }
  }
  return hits;
}

/**
 * Try eslint-plugin-security via npx when the target has eslint available.
 * Returns empty on missing tooling (non-fatal).
 */
async function tryEslintSecurity(
  options: StaticAnalysisOptions,
): Promise<PatternHit[]> {
  const result = await runCommand(
    "npx",
    [
      "--yes",
      "eslint",
      ".",
      "--ext",
      ".js,.ts,.mjs,.cjs",
      "--format",
      "json",
      "--no-error-on-unmatched-pattern",
      "--plugin",
      "security",
      "--rule",
      "security/detect-eval-with-expression:error",
      "--rule",
      "security/detect-non-literal-fs-filename:warn",
      "--rule",
      "security/detect-child-process:error",
    ],
    {
      cwd: options.repoPath,
      policy: options.policy,
      grant: options.grant,
      timeoutMs: 45_000,
      maxOutputBytes: 512_000,
    },
  );

  if (result.timedOut || !result.stdout.trim().startsWith("[")) {
    return [];
  }

  try {
    const reports = JSON.parse(result.stdout) as Array<{
      filePath: string;
      messages?: Array<{
        ruleId?: string | null;
        message?: string;
        line?: number;
        severity?: number;
      }>;
    }>;
    const hits: PatternHit[] = [];
    for (const file of reports) {
      const rel = path.relative(options.repoPath, file.filePath).replace(/\\/g, "/");
      if (!rel || rel.startsWith("..") || rel.includes("node_modules")) continue;
      if (options.grant) {
        try {
          options.policy.assertPathAllowed(options.grant, rel);
        } catch {
          continue;
        }
      }
      for (const msg of file.messages ?? []) {
        if (!msg.ruleId?.startsWith("security/")) continue;
        hits.push({
          path: rel,
          line: msg.line ?? 1,
          ruleId: msg.ruleId,
          summary: msg.message ?? msg.ruleId,
          excerpt: `${msg.ruleId}:${msg.line ?? "?"}`,
          severity: (msg.severity ?? 1) >= 2 ? "high" : "medium",
        });
      }
    }
    return hits;
  } catch {
    return [];
  }
}

/**
 * Built-in static security scan + optional eslint-plugin-security.
 */
export async function detectStaticAnalysisFindings(
  options: StaticAnalysisOptions,
): Promise<Finding[]> {
  const maxFiles = options.maxFiles ?? 80;
  const hits: PatternHit[] = [];

  try {
    const eslintHits = await tryEslintSecurity(options);
    hits.push(...eslintHits);
  } catch {
    /* tooling optional */
  }

  if (!hits.length) {
    const files = await walkSourceFiles(options.repoPath, maxFiles);
    for (const abs of files) {
      const rel = path.relative(options.repoPath, abs).replace(/\\/g, "/");
      if (options.grant) {
        try {
          options.policy.assertPathAllowed(options.grant, rel);
        } catch {
          continue;
        }
      }
      try {
        const st = await stat(abs);
        if (st.size > 200_000) continue;
        const content = await readFile(abs, "utf8");
        hits.push(...scanContent(rel, content));
      } catch {
        /* skip */
      }
    }
  }

  const now = new Date().toISOString();
  const byKey = new Map<string, PatternHit>();
  for (const hit of hits) {
    const key = `${hit.path}:${hit.ruleId}:${hit.line}`;
    if (!byKey.has(key)) byKey.set(key, hit);
  }

  const findings: Finding[] = [];
  for (const hit of [...byKey.values()].slice(0, 25)) {
    findings.push({
      id: randomUUID(),
      kind: "functional_bug",
      title: `Static: ${hit.summary} in ${hit.path}`,
      summary: `${hit.ruleId} at ${hit.path}:${hit.line} — ${hit.summary}`,
      severity: hit.severity,
      confidence: {
        value: hit.ruleId.startsWith("security/") ? 0.85 : 0.72,
        rationale: `static_analysis:${hit.ruleId}`,
      },
      evidence: [
        {
          id: randomUUID(),
          kind: "file",
          summary: hit.summary,
          path: hit.path,
          excerpt: hit.excerpt,
          confidence: { value: 0.8, rationale: "Static pattern / eslint-security" },
          observedAt: now,
        },
      ],
      relatedNeuronIds: options.neuronIds.slice(0, 5),
      pathHints: [hit.path],
    });
  }
  return findings;
}
