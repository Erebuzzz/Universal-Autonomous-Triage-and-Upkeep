import type { Finding } from "@uatu/domain";

const SEV_RANK: Record<Finding["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function findingKey(f: Finding): string {
  const path = (f.pathHints[0] ?? f.evidence[0]?.path ?? "").replace(/\\/g, "/");
  if (f.remediationHint?.packageName) {
    return `dep:${f.remediationHint.packageName}:${f.remediationHint.advisoryId}`;
  }
  const marker = normalizeTitle(f.title).slice(0, 80);
  return `${f.kind}:${path}:${marker}`;
}

function score(f: Finding): number {
  return SEV_RANK[f.severity] * 100 + f.confidence.value * 10 + (f.proposedDiff || f.remediationHint ? 5 : 0);
}

/**
 * Merge, dedupe, and rank findings from npm audit / static / LLM / tests.
 */
export function mergeAndRankFindings(groups: Finding[][]): Finding[] {
  const best = new Map<string, Finding>();
  for (const group of groups) {
    for (const f of group) {
      const key = findingKey(f);
      const prev = best.get(key);
      if (!prev || score(f) > score(prev)) {
        best.set(key, f);
      } else if (prev && !prev.proposedDiff && f.proposedDiff) {
        best.set(key, { ...prev, proposedDiff: f.proposedDiff });
      } else if (prev && !prev.remediationHint && f.remediationHint) {
        best.set(key, { ...prev, remediationHint: f.remediationHint });
      }
    }
  }

  return [...best.values()].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });
}
