import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  decideWithOptionalLlm,
  planNextAction,
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
});
