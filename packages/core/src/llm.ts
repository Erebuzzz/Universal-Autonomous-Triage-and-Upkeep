/**
 * Optional Bedrock adapter. Demo-critical decisions always have rule-based fallbacks.
 * When UATU_BEDROCK_ENABLED is not true, all calls return deterministic null / rules.
 * Real API/network errors fall back to rules; missing config does not pretend to be Bedrock.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { BedrockModelDescriptor, ModelTier } from "@uatu/domain";

export interface LlmDecisionRequest {
  purpose: string;
  prompt: string;
  modelPreference?: string;
}

export interface LlmDecisionResult {
  provider: "none" | "bedrock" | "rules";
  text: string;
  usedModel: boolean;
  modelId?: string;
  modelTier?: ModelTier | string;
  reasoning?: string;
}

export interface PlanNextActionContext {
  state: string;
  findingSummary?: string;
  findingKind?: string;
  findingsCount?: number;
  availableActions: string[];
  extra?: string;
  modelPreference?: string;
}

export interface PlanNextActionResult {
  action: string;
  provider: "bedrock" | "rules";
  reasoning: string;
  modelId?: string;
  modelTier?: ModelTier | string;
}

const LLM_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;

export const BEDROCK_MODEL_CATALOG: BedrockModelDescriptor[] = [
  {
    id: "auto",
    name: "Auto (Smart Complexity Router)",
    provider: "System",
    tier: "auto",
    rpm: 25,
    tpm: "Dynamic",
    description: "Routes by complexity: Nova Micro for triage, Nova Lite for dependencies, Nova 2 Omni for complex diffs.",
    modelId: "auto",
  },
  {
    id: "nova-micro",
    name: "Amazon Nova Micro",
    provider: "Amazon",
    tier: "fast",
    rpm: 20,
    tpm: "400K",
    description: "Ultra-low latency and minimal cost. Ideal for classification and next-action decisions.",
    modelId: "apac.amazon.nova-micro-v1:0",
  },
  {
    id: "nova-lite",
    name: "Amazon Nova Lite",
    provider: "Amazon",
    tier: "balanced",
    rpm: 20,
    tpm: "400K",
    description: "Fast multimodal model for dependency audit analysis and code review.",
    modelId: "apac.amazon.nova-lite-v1:0",
  },
  {
    id: "nova-2-omni",
    name: "Amazon Nova 2 Omni",
    provider: "Amazon",
    tier: "advanced",
    rpm: 20,
    tpm: "8M",
    description: "Next-generation flagship multimodal model with 8M TPM for deep code synthesis and patch generation.",
    modelId: "global.amazon.nova-2-omni-v1:0",
  },
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: "Anthropic",
    tier: "fast",
    rpm: 8,
    tpm: "600K",
    description: "Fast and lightweight Anthropic model for responsive triage.",
    modelId: "apac.anthropic.claude-3-haiku-20240307-v1:0",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    tier: "fast",
    rpm: 10,
    tpm: "5M",
    description: "High-throughput global cross-region Claude with 5M TPM.",
    modelId: "global.anthropic.claude-haiku-4-5",
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet v2",
    provider: "Anthropic",
    tier: "flagship",
    rpm: 1,
    tpm: "800K",
    description: "Industry gold standard for code logic (limited to 1 RPM quota).",
    modelId: "apac.anthropic.claude-3-5-sonnet-20241022-v2:0",
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5 v1",
    provider: "Anthropic",
    tier: "advanced",
    rpm: 10,
    tpm: "5M",
    description: "Next-generation high-capacity coding with 10 RPM global cross-region quota.",
    modelId: "global.anthropic.claude-sonnet-4-5-v1",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    tier: "advanced",
    rpm: 10,
    tpm: "6M",
    description: "Enhanced global cross-region Sonnet with 6M TPM for high-volume analysis.",
    modelId: "global.anthropic.claude-sonnet-4-6",
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    tier: "flagship",
    rpm: 5,
    tpm: "2M",
    description: "Deep reasoning across complex architecture and multi-repo relationships.",
    modelId: "global.anthropic.claude-opus-4-5",
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6 v1",
    provider: "Anthropic",
    tier: "flagship",
    rpm: 5,
    tpm: "3M",
    description: "Flagship global reasoning model with 3M TPM for deep architectural synthesis.",
    modelId: "global.anthropic.claude-opus-4-6-v1",
  },
  {
    id: "llama-3-2-3b",
    name: "Llama 3.2 3B Instruct",
    provider: "Meta",
    tier: "fast",
    rpm: 16,
    tpm: "600K",
    description: "Fast open-weights model with 16 RPM throughput.",
    modelId: "apac.meta.llama3-2-3b-instruct-v1:0",
  },
  {
    id: "rules-only",
    name: "Deterministic Rules Only",
    provider: "System",
    tier: "rules",
    rpm: 0,
    tpm: "0",
    description: "Disables Bedrock inference; uses deterministic AST and static rules.",
    modelId: "rules",
  },
];

export function getModelCatalog(): BedrockModelDescriptor[] {
  return BEDROCK_MODEL_CATALOG;
}

export interface ResolvedModel {
  modelId: string;
  modelTier: ModelTier | string;
  fallbackModelId?: string;
}

export function resolveModelByComplexity(
  purpose: string,
  userPreference?: string,
): ResolvedModel {
  const pref = (userPreference ?? "").trim();
  const configuredDefault = (process.env.UATU_BEDROCK_MODEL_ID ?? "apac.amazon.nova-micro-v1:0").trim();

  // If explicit preference matching catalog:
  if (pref && pref !== "auto" && pref !== "default") {
    const found = BEDROCK_MODEL_CATALOG.find((m) => m.id === pref);
    if (found) {
      if (found.id === "rules-only") {
        return { modelId: "rules", modelTier: "rules" };
      }
      return {
        modelId: found.modelId,
        modelTier: found.tier,
        fallbackModelId: configuredDefault,
      };
    }
    // Custom user modelId passed directly
    return { modelId: pref, modelTier: "custom", fallbackModelId: configuredDefault };
  }

  // Auto (smart complexity routing):
  if (
    purpose === "functional_root_cause" ||
    purpose === "propose_diff" ||
    purpose === "deep_investigation"
  ) {
    // High complexity tier: Nova 2 Omni (20 RPM, 8M TPM) or configured high-tier model
    const highModel =
      process.env.UATU_BEDROCK_HIGH_MODEL_ID?.trim() || "global.amazon.nova-2-omni-v1:0";
    return {
      modelId: highModel,
      modelTier: "advanced",
      fallbackModelId: configuredDefault,
    };
  }

  if (purpose === "code_review" || purpose === "dependency_security") {
    // Medium complexity tier: Nova Lite (20 RPM)
    const midModel = process.env.UATU_BEDROCK_MID_MODEL_ID?.trim() || "apac.amazon.nova-lite-v1:0";
    return {
      modelId: midModel,
      modelTier: "balanced",
      fallbackModelId: configuredDefault,
    };
  }

  // Low complexity tier (plan_next_action, pr_review_bot, triage): Nova Micro (20 RPM)
  const lowModel =
    process.env.UATU_BEDROCK_LOW_MODEL_ID?.trim() ||
    configuredDefault ||
    "apac.amazon.nova-micro-v1:0";
  return {
    modelId: lowModel,
    modelTier: "fast",
    fallbackModelId: undefined,
  };
}

/** Injectable for tests: real client uses AWS SDK Converse. */
export type BedrockInvoker = (input: {
  modelId: string;
  region: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}) => Promise<string>;

let bedrockInvokerOverride: BedrockInvoker | undefined;

export function setBedrockInvokerForTests(invoker: BedrockInvoker | undefined): void {
  bedrockInvokerOverride = invoker;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("LLM decision timed out")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function bedrockConfig(): { enabled: boolean; modelId: string; region: string } {
  const enabled = process.env.UATU_BEDROCK_ENABLED === "true";
  const modelId = (process.env.UATU_BEDROCK_MODEL_ID ?? "").trim();
  const region =
    (process.env.UATU_BEDROCK_REGION ?? process.env.AWS_REGION ?? "ap-south-1").trim() ||
    "ap-south-1";
  return { enabled, modelId, region };
}

async function defaultBedrockInvoke(input: {
  modelId: string;
  region: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
}): Promise<string> {
  const client = new BedrockRuntimeClient({
    region: input.region,
    maxAttempts: 3,
    retryMode: "adaptive",
  });
  const response = await client.send(
    new ConverseCommand({
      modelId: input.modelId,
      system: input.system ? [{ text: input.system }] : undefined,
      messages: [{ role: "user", content: [{ text: input.prompt }] }],
      inferenceConfig: {
        maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: 0.2,
      },
    }),
  );
  const parts = response.output?.message?.content ?? [];
  const text = parts
    .map((p) => ("text" in p && p.text ? p.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new Error("Bedrock Converse returned empty content");
  }
  return text;
}

async function invokeBedrock(
  prompt: string,
  opts?: { modelId?: string; system?: string; maxTokens?: number },
): Promise<string> {
  const { modelId: defaultModelId, region } = bedrockConfig();
  const activeModelId = (opts?.modelId ?? defaultModelId).trim();
  if (!activeModelId) {
    throw new Error("UATU_BEDROCK_MODEL_ID is required when Bedrock is enabled");
  }
  const invoker = bedrockInvokerOverride ?? defaultBedrockInvoke;
  return invoker({
    modelId: activeModelId,
    region,
    prompt,
    system: opts?.system,
    maxTokens: opts?.maxTokens,
  });
}

function isEmptyPurpose(purpose: string): boolean {
  return (
    purpose === "functional_root_cause" ||
    purpose === "code_review" ||
    purpose === "propose_diff"
  );
}

/**
 * Rule fallback for triage; for empty-purpose callers an empty ruleFallback
 * means "no LLM answer" so callers can fall back to fixture detection.
 */
export async function decideWithOptionalLlm(
  request: LlmDecisionRequest,
  ruleFallback: string,
): Promise<LlmDecisionResult> {
  const { enabled } = bedrockConfig();
  if (!enabled) {
    if (isEmptyPurpose(request.purpose)) {
      return {
        provider: "none",
        text: "",
        usedModel: false,
        reasoning: "Bedrock disabled",
      };
    }
    return {
      provider: "rules",
      text: ruleFallback,
      usedModel: false,
      reasoning: "Bedrock disabled; using rule fallback",
    };
  }

  const resolved = resolveModelByComplexity(request.purpose, request.modelPreference);
  if (resolved.modelTier === "rules" || resolved.modelId === "rules") {
    return {
      provider: "rules",
      text: ruleFallback,
      usedModel: false,
      modelTier: "rules",
      reasoning: "Deterministic rules explicitly selected by user preference",
    };
  }

  let activeModelId = resolved.modelId;
  let activeTier = resolved.modelTier;

  try {
    const text = await withTimeout(
      invokeBedrock(request.prompt, {
        modelId: activeModelId,
        system: `You are UATU, an autonomous triage agent. Purpose: ${request.purpose}. Be concise and actionable.`,
        maxTokens:
          request.purpose === "propose_diff" || request.purpose === "functional_root_cause"
            ? 2048
            : 512,
      }),
      LLM_TIMEOUT_MS,
    );
    return {
      provider: "bedrock",
      text,
      usedModel: true,
      modelId: activeModelId,
      modelTier: activeTier,
      reasoning: `Bedrock Converse (${activeModelId} [${activeTier}]) for ${request.purpose}`,
    };
  } catch (err) {
    const errStr = err instanceof Error ? err.message : String(err);
    // Automatic rate limit / throttling cascade
    const isThrottled =
      errStr.includes("ThrottlingException") ||
      errStr.includes("TooManyRequests") ||
      errStr.includes("429") ||
      errStr.includes("rate limit") ||
      errStr.includes("quota");

    if (
      isThrottled &&
      resolved.fallbackModelId &&
      resolved.fallbackModelId !== activeModelId
    ) {
      try {
        const fallbackText = await withTimeout(
          invokeBedrock(request.prompt, {
            modelId: resolved.fallbackModelId,
            system: `You are UATU, an autonomous triage agent. Purpose: ${request.purpose}. Be concise and actionable.`,
            maxTokens:
              request.purpose === "propose_diff" || request.purpose === "functional_root_cause"
                ? 2048
                : 512,
          }),
          LLM_TIMEOUT_MS,
        );
        return {
          provider: "bedrock",
          text: fallbackText,
          usedModel: true,
          modelId: resolved.fallbackModelId,
          modelTier: "fast-fallback",
          reasoning: `Throttling on ${activeModelId}; cascaded to fallback (${resolved.fallbackModelId})`,
        };
      } catch {
        // Fall through to standard fallback logic below
      }
    }

    if (isEmptyPurpose(request.purpose)) {
      return {
        provider: "none",
        text: "",
        usedModel: false,
        modelId: activeModelId,
        modelTier: activeTier,
        reasoning: `Bedrock error; empty fallback: ${errStr}`,
      };
    }
    return {
      provider: "rules",
      text: ruleFallback,
      usedModel: false,
      modelId: activeModelId,
      modelTier: activeTier,
      reasoning: `Bedrock error (${activeModelId}); rules fallback: ${errStr}`,
    };
  }
}

/**
 * Choose the next workflow action at TRIAGED / INVESTIGATING (and similar).
 * Always returns a member of availableActions; logs provider + reasoning via result.
 */
export async function planNextAction(
  context: PlanNextActionContext,
): Promise<PlanNextActionResult> {
  const actions = context.availableActions.filter(Boolean);
  const ruleAction = actions[0] ?? "continue";
  const ruleReasoning = `Default first action among [${actions.join(", ")}] for state=${context.state}`;

  if (!actions.length) {
    return { action: "continue", provider: "rules", reasoning: "No available actions; continue" };
  }

  const { enabled } = bedrockConfig();
  if (!enabled) {
    return { action: ruleAction, provider: "rules", reasoning: ruleReasoning };
  }

  const resolved = resolveModelByComplexity("plan_next_action", context.modelPreference);
  if (resolved.modelTier === "rules" || resolved.modelId === "rules") {
    return {
      action: ruleAction,
      provider: "rules",
      reasoning: "Rules explicitly selected by user",
      modelTier: "rules",
    };
  }

  const prompt = [
    `Workflow state: ${context.state}`,
    `Finding kind: ${context.findingKind ?? "n/a"}`,
    `Finding summary: ${context.findingSummary ?? "n/a"}`,
    `Findings count: ${context.findingsCount ?? 0}`,
    context.extra ? `Extra: ${context.extra}` : "",
    `Available actions (pick exactly one): ${JSON.stringify(actions)}`,
    `Reply with JSON only: {"action":"<one of available>","reasoning":"<brief why>"}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await withTimeout(
      invokeBedrock(prompt, {
        modelId: resolved.modelId,
        system: "You are UATU planning the next remediation step. Prefer safe, high-confidence actions.",
        maxTokens: 256,
      }),
      LLM_TIMEOUT_MS,
    );
    const parsed = parseActionJson(text, actions);
    if (parsed) {
      return {
        action: parsed.action,
        provider: "bedrock",
        modelId: resolved.modelId,
        modelTier: resolved.modelTier,
        reasoning:
          parsed.reasoning ||
          `Bedrock Converse (${resolved.modelId} [${resolved.modelTier}]) planNextAction`,
      };
    }
    return {
      action: ruleAction,
      provider: "rules",
      modelId: resolved.modelId,
      modelTier: resolved.modelTier,
      reasoning: `Bedrock response unparseable; rules: ${ruleReasoning}`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      action: ruleAction,
      provider: "rules",
      modelId: resolved.modelId,
      modelTier: resolved.modelTier,
      reasoning: `Bedrock error (${resolved.modelId}); rules: ${reason}`,
    };
  }
}

function parseActionJson(
  text: string,
  actions: string[],
): { action: string; reasoning: string } | undefined {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as {
      action?: string;
      reasoning?: string;
    };
    const action = (obj.action ?? "").trim();
    if (!actions.includes(action)) return undefined;
    return { action, reasoning: (obj.reasoning ?? "").trim() };
  } catch {
    return undefined;
  }
}

export function ruleTriagePriority(kind: "functional_bug" | "dependency_security"): number {
  return kind === "dependency_security" ? 90 : 80;
}
