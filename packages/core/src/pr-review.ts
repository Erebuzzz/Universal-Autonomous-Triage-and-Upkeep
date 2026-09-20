/**
 * Automated PR review (Phase G) — comment only, never merge.
 */
import {
  getPullRequestDiff,
  submitPullRequestReview,
  type GitHubRepoRef,
} from "./github.js";
import type { BrainGraph } from "@uatu/domain";

export interface ReviewPullRequestInput {
  repo: GitHubRepoRef;
  pullNumber: number;
  installationId?: number;
  title?: string;
  brain?: BrainGraph;
}

function summarizeDiff(diff: string): { files: string[]; risky: string[] } {
  const files = new Set<string>();
  const risky: string[] = [];
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/") || line.startsWith("--- a/")) {
      const p = line.slice(6).trim();
      if (p && p !== "/dev/null") files.add(p);
    }
    if (/^\+.*\beval\s*\(/.test(line)) risky.push("Introduces eval()");
    if (/^\+.*(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{12,}/i.test(line)) {
      risky.push("Possible hardcoded credential in added lines");
    }
    if (/^\+.*innerHTML\s*=/.test(line)) risky.push("Assigns innerHTML");
    if (/^\+.*child_process/.test(line)) risky.push("Touches child_process");
  }
  return { files: [...files].slice(0, 40), risky: [...new Set(risky)] };
}

function brainContextNotes(brain: BrainGraph | undefined, files: string[]): string[] {
  if (!brain) return [];
  const notes: string[] = [];
  const deps = brain.neurons.filter((n) => n.kind === "Dependency").slice(0, 8);
  if (deps.length) {
    notes.push(
      `Org Brain knows ${deps.length}+ shared dependencies (e.g. ${deps
        .slice(0, 3)
        .map((d) => d.label)
        .join(", ")}).`,
    );
  }
  const contradicted = brain.synapses.filter((s) => s.kind === "CONTRADICTS").length;
  if (contradicted) {
    notes.push(`Brain has ${contradicted} CONTRADICTS edge(s) — treat overlapping changes carefully.`);
  }
  const touched = brain.neurons.filter(
    (n) =>
      (n.kind === "File" || n.kind === "SecurityFinding") &&
      files.some((f) => String(n.payload.path ?? n.label).includes(f) || f.includes(String(n.payload.path ?? ""))),
  );
  if (touched.length) {
    notes.push(`Diff touches ${touched.length} path(s) already modeled in the Brain.`);
  }
  return notes;
}

/**
 * Build a substantive review body from the PR diff + optional Brain context.
 */
export async function buildPullRequestReview(
  input: ReviewPullRequestInput,
): Promise<{ body: string; event: "COMMENT" }> {
  const diff = await getPullRequestDiff({
    owner: input.repo.owner,
    repo: input.repo.repo,
    pullNumber: input.pullNumber,
    installationId: input.installationId,
  });
  const { files, risky } = summarizeDiff(diff);
  const brainNotes = brainContextNotes(input.brain, files);

  const lines: string[] = [
    `Reviewed PR #${input.pullNumber}${input.title ? `: **${input.title}**` : ""}.`,
    "",
    `**Changed files (${files.length}):**`,
    ...(files.length ? files.map((f) => `- \`${f}\``) : ["- (could not parse file list from diff)"]),
  ];

  if (risky.length) {
    lines.push("", "**Concerns flagged from the diff:**", ...risky.map((r) => `- ${r}`));
  } else {
    lines.push("", "No high-risk static patterns found in added lines.");
  }

  if (brainNotes.length) {
    lines.push("", "**Repository Brain context:**", ...brainNotes.map((n) => `- ${n}`));
  }

  lines.push(
    "",
    "This is an automated UATU review for an authorized repository. A human should still approve before merge.",
    "UATU will **not** merge this PR.",
  );

  return { body: lines.join("\n"), event: "COMMENT" };
}

export async function reviewPullRequestAndComment(
  input: ReviewPullRequestInput,
): Promise<{ reviewId: number; htmlUrl?: string }> {
  const built = await buildPullRequestReview(input);
  const result = await submitPullRequestReview({
    owner: input.repo.owner,
    repo: input.repo.repo,
    pullNumber: input.pullNumber,
    body: built.body,
    event: "COMMENT",
    installationId: input.installationId,
  });
  return { reviewId: result.id, htmlUrl: result.htmlUrl };
}
