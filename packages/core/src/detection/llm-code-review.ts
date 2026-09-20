import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AuthorizationGrant, Finding } from "@uatu/domain";
import type { AuthorizationPolicy } from "../policy.js";
import { decideWithOptionalLlm } from "../llm.js";

const LLM_CONFIDENCE_CAP = 0.75;

export interface LlmCodeReviewOptions {
  repoPath: string;
  policy: AuthorizationPolicy;
  grant?: AuthorizationGrant;
  neuronIds: string[];
  /** Paths already flagged by tests or static analysis. */
  flaggedPaths: string[];
  testOutputExcerpt?: string;
  modelPreference?: string;
}

function parseReviewJson(text: string): {
  issues?: Array<{
    path?: string;
    summary?: string;
    severity?: Finding["severity"];
    hypothesis?: string;
    unifiedDiff?: string;
  }>;
} | undefined {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as {
      issues?: Array<{
        path?: string;
        summary?: string;
        severity?: Finding["severity"];
        hypothesis?: string;
        unifiedDiff?: string;
      }>;
    };
  } catch {
    return undefined;
  }
}

async function readAllowedSnippet(
  repoPath: string,
  rel: string,
  policy: AuthorizationPolicy,
  grant?: AuthorizationGrant,
): Promise<{ path: string; content: string } | undefined> {
  try {
    if (grant) policy.assertPathAllowed(grant, rel);
    const content = await readFile(path.join(repoPath, rel), "utf8");
    return { path: rel, content: content.slice(0, 3500) };
  } catch {
    return undefined;
  }
}

/**
 * LLM code review over failing-test / static-flagged files (Phase A agent).
 */
export async function detectLlmCodeReviewFindings(
  options: LlmCodeReviewOptions,
): Promise<Finding[]> {
  const uniquePaths = [...new Set(options.flaggedPaths.map((p) => p.replace(/\\/g, "/")))]
    .filter((p) => p && !p.includes("..") && !p.includes("node_modules"))
    .slice(0, 6);
  if (!uniquePaths.length) return [];

  const files: Array<{ path: string; content: string }> = [];
  for (const rel of uniquePaths) {
    const snip = await readAllowedSnippet(options.repoPath, rel, options.policy, options.grant);
    if (snip) files.push(snip);
  }
  if (!files.length) return [];

  const llm = await decideWithOptionalLlm(
    {
      purpose: "code_review",
      modelPreference: options.modelPreference,
      prompt: [
        "Review the flagged files for bugs and security issues.",
        'Return JSON only: {"issues":[{"path":"...","summary":"...","severity":"low|medium|high|critical","hypothesis":"...","unifiedDiff":"optional unified diff"}]}',
        options.testOutputExcerpt
          ? `Test/static context:\n${options.testOutputExcerpt.slice(0, 2000)}`
          : "",
        "Files:",
        ...files.map((f) => `--- ${f.path}\n${f.content}`),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    "",
  );

  if (llm.provider !== "bedrock" || !llm.text.trim()) {
    return [];
  }

  const parsed = parseReviewJson(llm.text);
  if (!parsed?.issues?.length) return [];

  const now = new Date().toISOString();
  const findings: Finding[] = [];
  for (const issue of parsed.issues.slice(0, 8)) {
    const issuePath = (issue.path ?? files[0]!.path).replace(/\\/g, "/");
    if (issuePath.includes("..") || issuePath.includes("node_modules")) continue;
    if (options.grant) {
      try {
        options.policy.assertPathAllowed(options.grant, issuePath);
      } catch {
        continue;
      }
    }
    const summary = (issue.hypothesis ?? issue.summary ?? "LLM code review finding").slice(0, 500);
    findings.push({
      id: randomUUID(),
      kind: "functional_bug",
      title: `LLM review: ${(issue.summary ?? summary).slice(0, 80)}`,
      summary,
      severity: issue.severity ?? "medium",
      confidence: {
        value: Math.min(LLM_CONFIDENCE_CAP, 0.7),
        rationale: `LLM code_review (${llm.reasoning ?? "bedrock"})`,
      },
      evidence: [
        {
          id: randomUUID(),
          kind: "file",
          summary: issue.summary ?? "LLM-flagged file",
          path: issuePath,
          excerpt: files.find((f) => f.path === issuePath)?.content.slice(0, 400),
          confidence: { value: 0.65, rationale: "LLM code review" },
          observedAt: now,
        },
      ],
      relatedNeuronIds: options.neuronIds.slice(0, 5),
      pathHints: [issuePath],
      proposedDiff: issue.unifiedDiff?.trim() || undefined,
    });
  }
  return findings;
}
