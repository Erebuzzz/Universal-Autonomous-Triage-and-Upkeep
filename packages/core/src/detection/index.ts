export { readDetectionMode, withDetectionFallback } from "./mode.js";
export type { DetectionMode, DetectionModeUsed } from "./mode.js";
export { detectNpmAuditFindings } from "./npm-audit.js";
export { generalDetect } from "./general-detect.js";
export { detectStaticAnalysisFindings } from "./static-analysis.js";
export { detectLlmCodeReviewFindings } from "./llm-code-review.js";
export { mergeAndRankFindings } from "./merge-findings.js";
export {
  applyDependencyRemediation,
  applyFunctionalDiff,
  generalDepBranchName,
} from "./general-patch.js";
export { readTestScript, parseTestScriptArgv } from "./package-scripts.js";
export { applyUnifiedDiff, parseUnifiedDiff, DiffApplyError } from "./apply-unified-diff.js";
