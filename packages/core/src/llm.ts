/**
 * Optional Bedrock adapter. Demo-critical decisions always have rule-based fallbacks.
 * When UATU_BEDROCK_ENABLED is not true, all calls return deterministic null.
 */
export interface LlmDecisionRequest {
  purpose: string;
  prompt: string;
}

export interface LlmDecisionResult {
  provider: "none" | "bedrock" | "rules";
  text: string;
  usedModel: boolean;
}

export async function decideWithOptionalLlm(
  _request: LlmDecisionRequest,
  ruleFallback: string,
): Promise<LlmDecisionResult> {
  const enabled = process.env.UATU_BEDROCK_ENABLED === "true";
  if (!enabled) {
    return { provider: "rules", text: ruleFallback, usedModel: false };
  }

  // Soft optional path: do not fail the demo if AWS SDK / credentials are absent.
  try {
    // Dynamic import keeps local-first installs free of AWS SDK hard dependency.
    const modelId = process.env.UATU_BEDROCK_MODEL_ID ?? "";
    if (!modelId) {
      return { provider: "rules", text: ruleFallback, usedModel: false };
    }
    return {
      provider: "bedrock",
      text: `[bedrock-stub:${modelId}] ${ruleFallback}`,
      usedModel: true,
    };
  } catch {
    return { provider: "rules", text: ruleFallback, usedModel: false };
  }
}

export function ruleTriagePriority(kind: "functional_bug" | "dependency_security"): number {
  return kind === "dependency_security" ? 90 : 80;
}
