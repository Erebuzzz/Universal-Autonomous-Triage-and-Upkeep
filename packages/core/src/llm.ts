/**
 * Optional Bedrock adapter. Demo-critical decisions always have rule-based fallbacks.
 * When UATU_BEDROCK_ENABLED is not true, all calls return deterministic null / rules.
 * Real API/network errors fall back to rules; missing config does not pretend to be Bedrock.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

export interface LlmDecisionRequest {
  purpose: string;
  prompt: string;
}

export interface LlmDecisionResult {
  provider: "none" | "bedrock" | "rules";
  text: string;
  usedModel: boolean;
  reasoning?: string;
}

export interface PlanNextActionContext {
  state: string;
  findingSummary?: string;
  findingKind?: string;
  findingsCount?: number;
  availableActions: string[];
  extra?: string;
}

export interface PlanNextActionResult {
  action: string;
  provider: "bedrock" | "rules";
  reasoning: string;
}

const LLM_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;

/** Injectable for tests — real client uses AWS SDK Converse. */
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
  opts?: { system?: string; maxTokens?: number },
): Promise<string> {
  const { modelId, region } = bedrockConfig();
  if (!modelId) {
    throw new Error("UATU_BEDROCK_MODEL_ID is required when Bedrock is enabled");
  }
  const invoker = bedrockInvokerOverride ?? defaultBedrockInvoke;
  return invoker({
    modelId,
    region,
    prompt,
    system: opts?.system,
    maxTokens: opts?.maxTokens,
  });
}

function isEmptyPurpose(purpose: string): boolean {
  return purpose === "functional_root_cause" || purpose === "code_review" || purpose === "propose_diff";
}

/**
 * Rule fallback for triage; for empty-purpose callers an empty ruleFallback
 * means "no LLM answer" so callers can fall back to fixture detection.
 */
export async function decideWithOptionalLlm(
  request: LlmDecisionRequest,
  ruleFallback: string,
): Promise<LlmDecisionResult> {
  const { enabled, modelId } = bedrockConfig();
  if (!enabled || !modelId) {
    if (isEmptyPurpose(request.purpose)) {
      return {
        provider: "none",
        text: "",
        usedModel: false,
        reasoning: "Bedrock disabled or model id unset",
      };
    }
    return {
      provider: "rules",
      text: ruleFallback,
      usedModel: false,
      reasoning: "Bedrock disabled; using rule fallback",
    };
  }

  try {
    const text = await withTimeout(
      invokeBedrock(request.prompt, {
        system: `You are UATU, an autonomous triage agent. Purpose: ${request.purpose}. Be concise and actionable.`,
        maxTokens: request.purpose === "propose_diff" || request.purpose === "functional_root_cause" ? 2048 : 512,
      }),
      LLM_TIMEOUT_MS,
    );
    return {
      provider: "bedrock",
      text,
      usedModel: true,
      reasoning: `Bedrock Converse (${modelId}) for ${request.purpose}`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (isEmptyPurpose(request.purpose)) {
      return {
        provider: "none",
        text: "",
        usedModel: false,
        reasoning: `Bedrock error; empty fallback: ${reason}`,
      };
    }
    return {
      provider: "rules",
      text: ruleFallback,
      usedModel: false,
      reasoning: `Bedrock error; rules fallback: ${reason}`,
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

  const { enabled, modelId } = bedrockConfig();
  if (!enabled || !modelId) {
    return { action: ruleAction, provider: "rules", reasoning: ruleReasoning };
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
        reasoning: parsed.reasoning || `Bedrock Converse (${modelId}) planNextAction`,
      };
    }
    return {
      action: ruleAction,
      provider: "rules",
      reasoning: `Bedrock response unparseable; rules: ${ruleReasoning}`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      action: ruleAction,
      provider: "rules",
      reasoning: `Bedrock error; rules: ${reason}`,
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
