import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeAndRankFindings } from "./merge-findings.js";
import type { Finding } from "@uatu/domain";

function finding(partial: Partial<Finding> & Pick<Finding, "id" | "title" | "kind">): Finding {
  return {
    summary: partial.summary ?? partial.title,
    severity: partial.severity ?? "medium",
    confidence: partial.confidence ?? { value: 0.8, rationale: "t" },
    evidence: partial.evidence ?? [],
    relatedNeuronIds: [],
    pathHints: partial.pathHints ?? ["src/a.js"],
    ...partial,
  };
}

describe("mergeAndRankFindings", () => {
  it("dedupes by package advisory and prefers higher severity", () => {
    const a = finding({
      id: "1",
      kind: "dependency_security",
      title: "minimist vuln",
      severity: "medium",
      remediationHint: {
        packageName: "minimist",
        installedVersion: "0.0.8",
        fixedVersion: "1.2.6",
        advisoryId: "GHSA-x",
      },
    });
    const b = finding({
      id: "2",
      kind: "dependency_security",
      title: "minimist critical",
      severity: "critical",
      confidence: { value: 0.95, rationale: "npm" },
      remediationHint: {
        packageName: "minimist",
        installedVersion: "0.0.8",
        fixedVersion: "1.2.6",
        advisoryId: "GHSA-x",
      },
    });
    const merged = mergeAndRankFindings([[a], [b]]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.severity, "critical");
  });
});
