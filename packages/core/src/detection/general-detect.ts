import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AuthorizationGrant, Finding } from "@uatu/domain";
import type { AuthorizationPolicy } from "../policy.js";
import { runCommand } from "../command-runner.js";
import { decideWithOptionalLlm } from "../llm.js";
import { detectNpmAuditFindings } from "./npm-audit.js";
import { detectStaticAnalysisFindings } from "./static-analysis.js";
import { detectLlmCodeReviewFindings } from "./llm-code-review.js";
import { mergeAndRankFindings } from "./merge-findings.js";
import { readTestScript } from "./package-scripts.js";

const LLM_CONFIDENCE_CAP = 0.75;

export interface GeneralDetectOptions {
  repoPath: string;
  policy: AuthorizationPolicy;
  grant?: AuthorizationGrant;
  neuronIds: string[];
  modelPreference?: string;
}

function extractReferencedPaths(output: string): string[] {
  const paths = new Set<string>();
  const patterns = [
    /(?:^|\s)((?:src|test|lib|packages)\/[^\s:'"]+\.(?:js|ts|mjs|cjs))/gm,
    /at .+?\(([^)]+\.(?:js|ts|mjs|cjs):\d+)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      const raw = m[1]!.split(":")[0]!.replace(/\\/g, "/");
      if (!raw.includes("node_modules") && !raw.includes("..")) {
        paths.add(raw.replace(/^\.\//, ""));
      }
    }
  }
  return [...paths].slice(0, 6);
}

async function readAllowedFiles(
  repoPath: string,
  relPaths: string[],
  policy: AuthorizationPolicy,
  grant?: AuthorizationGrant,
): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string }> = [];
  for (const rel of relPaths) {
    try {
      if (grant) policy.assertPathAllowed(grant, rel);
      const content = await readFile(path.join(repoPath, rel), "utf8");
      out.push({ path: rel, content: content.slice(0, 4000) });
    } catch {
      /* skip denied or missing */
    }
  }
  return out;
}

function parseLlmJson(text: string): { hypothesis?: string; unifiedDiff?: string } | undefined {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as {
      hypothesis?: string;
      unifiedDiff?: string;
    };
  } catch {
    return undefined;
  }
}

async function detectFunctionalFromFailingTests(
  options: GeneralDetectOptions,
): Promise<{ findings: Finding[]; flaggedPaths: string[]; testExcerpt: string }> {
  const script = await readTestScript(options.repoPath);
  if (!script) return { findings: [], flaggedPaths: [], testExcerpt: "" };

  const testResult = await runCommand("npm", ["run", "test"], {
    cwd: options.repoPath,
    policy: options.policy,
    grant: options.grant,
    timeoutMs: 30_000,
    maxOutputBytes: 256_000,
  });

  if (testResult.timedOut) {
    throw new Error("npm run test timed out");
  }
  if (testResult.exitCode === 0) {
    return { findings: [], flaggedPaths: [], testExcerpt: "" };
  }

  const combined = `${testResult.stdout}\n${testResult.stderr}`;
  const refs = extractReferencedPaths(combined);
  for (const hint of ["src/range.js", "test/range.test.js"]) {
    if (!refs.includes(hint)) refs.push(hint);
  }
  const files = await readAllowedFiles(options.repoPath, refs, options.policy, options.grant);

  const llm = await decideWithOptionalLlm(
    {
      purpose: "functional_root_cause",
      modelPreference: options.modelPreference,
      prompt: [
        "Failing tests detected. Propose a minimal unified diff fix.",
        "Return JSON only: {\"hypothesis\":\"...\",\"unifiedDiff\":\"...\"}",
        "Test output:",
        combined.slice(0, 3000),
        "Files:",
        ...files.map((f) => `--- ${f.path}\n${f.content}`),
      ].join("\n\n"),
    },
    "",
  );

  if (llm.provider !== "bedrock" || !llm.text.trim()) {
    return {
      findings: [],
      flaggedPaths: files.map((f) => f.path),
      testExcerpt: combined.slice(0, 2000),
    };
  }

  const parsed = parseLlmJson(llm.text);
  if (!parsed?.unifiedDiff?.trim()) {
    return {
      findings: [],
      flaggedPaths: files.map((f) => f.path),
      testExcerpt: combined.slice(0, 2000),
    };
  }

  const now = new Date().toISOString();
  const hypothesis = parsed.hypothesis?.trim() || "LLM hypothesis from failing tests";
  return {
    findings: [
      {
        id: randomUUID(),
        kind: "functional_bug",
        title: "Failing tests - LLM root-cause hypothesis",
        summary: hypothesis.slice(0, 500),
        severity: "medium",
        confidence: {
          value: Math.min(LLM_CONFIDENCE_CAP, 0.75),
          rationale: `LLM functional_root_cause (${llm.reasoning ?? "bedrock"})`,
        },
        evidence: [
          {
            id: randomUUID(),
            kind: "test",
            summary: "npm run test failed",
            path: "package.json",
            excerpt: combined.slice(0, 800),
            confidence: { value: 0.85, rationale: "Failing test output" },
            observedAt: now,
          },
          ...files.slice(0, 3).map((f) => ({
            id: randomUUID(),
            kind: "file" as const,
            summary: `Referenced source ${f.path}`,
            path: f.path,
            excerpt: f.content.slice(0, 400),
            confidence: { value: 0.7, rationale: "Sandboxed file read" },
            observedAt: now,
          })),
        ],
        relatedNeuronIds: options.neuronIds.slice(0, 5),
        pathHints: files.map((f) => f.path),
        proposedDiff: parsed.unifiedDiff,
      },
    ],
    flaggedPaths: files.map((f) => f.path),
    testExcerpt: combined.slice(0, 2000),
  };
}

/**
 * General detection: npm audit + static analysis + failing-test/LLM + LLM code review.
 * Merge/dedupe/rank. Throws on hard timeouts so auto mode can fall back.
 */
export async function generalDetect(options: GeneralDetectOptions): Promise<Finding[]> {
  const audit = await detectNpmAuditFindings({
    ...options,
    timeoutMs: 10_000,
  });

  let staticFindings: Finding[] = [];
  try {
    staticFindings = await detectStaticAnalysisFindings(options);
  } catch {
    staticFindings = [];
  }

  let functionalFindings: Finding[] = [];
  let flaggedPaths: string[] = staticFindings.flatMap((f) => f.pathHints).slice(0, 8);
  let testExcerpt = "";
  try {
    const functional = await detectFunctionalFromFailingTests(options);
    functionalFindings = functional.findings;
    flaggedPaths = [...new Set([...flaggedPaths, ...functional.flaggedPaths])];
    testExcerpt = functional.testExcerpt;
  } catch (err) {
    if (!audit.length && !staticFindings.length) throw err;
  }

  let reviewFindings: Finding[] = [];
  try {
    reviewFindings = await detectLlmCodeReviewFindings({
      ...options,
      flaggedPaths,
      testOutputExcerpt: testExcerpt,
    });
  } catch {
    reviewFindings = [];
  }

  return mergeAndRankFindings([audit, staticFindings, functionalFindings, reviewFindings]);
}
