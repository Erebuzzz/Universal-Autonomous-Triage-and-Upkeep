import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  decideWithOptionalLlm,
  getModelCatalog,
  planNextAction,
  resolveModelByComplexity,
  setBedrockInvokerForTests,
} from "./llm.js";

describe("llm Bedrock adapter", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    setBedrockInvokerForTests(undefined);
    delete process.env.UATU_BEDROCK_ENABLED;
    delete process.env.UATU_BEDROCK_MODEL_ID;
  });

  afterEach(() => {
    setBedrockInvokerForTests(undefined);
    process.env.UATU_BEDROCK_ENABLED = prev.UATU_BEDROCK_ENABLED;
    process.env.UATU_BEDROCK_MODEL_ID = prev.UATU_BEDROCK_MODEL_ID;
    process.env.UATU_BEDROCK_REGION = prev.UATU_BEDROCK_REGION;
  });

  it("uses rules when Bedrock disabled", async () => {
    const r = await decideWithOptionalLlm({ purpose: "triage", prompt: "x" }, "rule-out");
    assert.equal(r.provider, "rules");
    assert.equal(r.text, "rule-out");
    assert.equal(r.usedModel, false);
    assert.ok(!r.text.includes("bedrock-stub"));
  });

  it("invokes real client path and returns bedrock provider", async () => {
    process.env.UATU_BEDROCK_ENABLED = "true";
    process.env.UATU_BEDROCK_MODEL_ID = "amazon.nova-micro-v1:0";
    setBedrockInvokerForTests(async ({ modelId, prompt }) => {
      assert.equal(modelId, "amazon.nova-micro-v1:0");
      assert.ok(prompt.length > 0);
      return "live-model-response";
    });
    const r = await decideWithOptionalLlm({ purpose: "triage", prompt: "prioritize" }, "fallback");
    assert.equal(r.provider, "bedrock");
    assert.equal(r.text, "live-model-response");
    assert.equal(r.usedModel, true);
    assert.ok(r.reasoning?.includes("Bedrock"));
    assert.ok(!r.text.includes("bedrock-stub"));
  });

  it("falls back to rules on API/network errors", async () => {
    process.env.UATU_BEDROCK_ENABLED = "true";
    process.env.UATU_BEDROCK_MODEL_ID = "amazon.nova-micro-v1:0";
    setBedrockInvokerForTests(async () => {
      throw new Error("AccessDeniedException: account verification");
    });
    const r = await decideWithOptionalLlm({ purpose: "triage", prompt: "x" }, "safe-rules");
    assert.equal(r.provider, "rules");
    assert.equal(r.text, "safe-rules");
    assert.ok(r.reasoning?.includes("AccessDeniedException"));
  });

  it("planNextAction parses bedrock JSON action", async () => {
    process.env.UATU_BEDROCK_ENABLED = "true";
    process.env.UATU_BEDROCK_MODEL_ID = "amazon.nova-micro-v1:0";
    setBedrockInvokerForTests(async () =>
      JSON.stringify({ action: "accept_root_cause", reasoning: "confidence high" }),
    );
    const plan = await planNextAction({
      state: "INVESTIGATING",
      availableActions: ["accept_root_cause", "low_confidence"],
    });
    assert.equal(plan.provider, "bedrock");
    assert.equal(plan.action, "accept_root_cause");
    assert.match(plan.reasoning, /confidence high/);
  });

  it("planNextAction falls back to rules on error", async () => {
    process.env.UATU_BEDROCK_ENABLED = "true";
    process.env.UATU_BEDROCK_MODEL_ID = "amazon.nova-micro-v1:0";
    setBedrockInvokerForTests(async () => {
      throw new Error("network reset");
    });
    const plan = await planNextAction({
      state: "TRIAGED",
      availableActions: ["select_top_finding", "needs_human"],
    });
    assert.equal(plan.provider, "rules");
    assert.equal(plan.action, "select_top_finding");
  });

  it("getModelCatalog returns valid descriptors including Nova 2 Omni", () => {
    const catalog = getModelCatalog();
    assert.ok(catalog.length >= 10);
    const omni = catalog.find((m) => m.id === "nova-2-omni");
    assert.ok(omni);
    assert.equal(omni.modelId, "global.amazon.nova-2-omni-v1:0");
    assert.equal(omni.rpm, 20);
    assert.equal(omni.tpm, "8M");
  });

  it("resolveModelByComplexity routes high complexity to Nova 2 Omni", () => {
    const high1 = resolveModelByComplexity("functional_root_cause");
    assert.equal(high1.modelId, "global.amazon.nova-2-omni-v1:0");
    assert.equal(high1.modelTier, "advanced");

    const high2 = resolveModelByComplexity("propose_diff");
    assert.equal(high2.modelId, "global.amazon.nova-2-omni-v1:0");

    const high3 = resolveModelByComplexity("deep_investigation");
    assert.equal(high3.modelId, "global.amazon.nova-2-omni-v1:0");
  });

  it("resolveModelByComplexity routes medium complexity to Nova Lite", () => {
    const mid1 = resolveModelByComplexity("code_review");
    assert.equal(mid1.modelId, "apac.amazon.nova-lite-v1:0");
    assert.equal(mid1.modelTier, "balanced");

    const mid2 = resolveModelByComplexity("dependency_security");
    assert.equal(mid2.modelId, "apac.amazon.nova-lite-v1:0");
  });

  it("resolveModelByComplexity routes low complexity to Nova Micro", () => {
    const low = resolveModelByComplexity("triage");
    assert.equal(low.modelId, "apac.amazon.nova-micro-v1:0");
    assert.equal(low.modelTier, "fast");
  });

  it("resolveModelByComplexity respects explicit user preference", () => {
    const pref1 = resolveModelByComplexity("triage", "claude-3-haiku");
    assert.equal(pref1.modelId, "apac.anthropic.claude-3-haiku-20240307-v1:0");
    assert.equal(pref1.modelTier, "fast");

    const prefRules = resolveModelByComplexity("functional_root_cause", "rules-only");
    assert.equal(prefRules.modelId, "rules");
    assert.equal(prefRules.modelTier, "rules");

    const prefOmni = resolveModelByComplexity("triage", "nova-2-omni");
    assert.equal(prefOmni.modelId, "global.amazon.nova-2-omni-v1:0");
  });

  it("cascades to fallback on ThrottlingException (429)", async () => {
    process.env.UATU_BEDROCK_ENABLED = "true";
    process.env.UATU_BEDROCK_MODEL_ID = "apac.amazon.nova-micro-v1:0";

    let callCount = 0;
    setBedrockInvokerForTests(async ({ modelId }) => {
      callCount += 1;
      if (modelId === "global.amazon.nova-2-omni-v1:0") {
        throw new Error("ThrottlingException: Rate exceeded (429)");
      }
      return "fallback-success";
    });

    const result = await decideWithOptionalLlm(
      {
        purpose: "functional_root_cause",
        prompt: "analyze patch",
      },
      "rule-fallback",
    );

    assert.equal(callCount, 2);
    assert.equal(result.provider, "bedrock");
    assert.equal(result.text, "fallback-success");
    assert.equal(result.modelId, "apac.amazon.nova-micro-v1:0");
    assert.equal(result.modelTier, "fast-fallback");
    assert.ok(result.reasoning?.includes("cascaded to fallback"));
  });
});
