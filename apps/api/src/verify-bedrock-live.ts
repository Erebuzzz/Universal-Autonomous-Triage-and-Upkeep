/**
 * Phase A acceptance helper: exercise decideWithOptionalLlm / planNextAction against
 * live Bedrock when enabled, otherwise verify mock path + document blockers.
 *
 * Usage:
 *   set AWS_PROFILE=erebuzzz
 *   set UATU_BEDROCK_ENABLED=true
 *   set UATU_BEDROCK_MODEL_ID=apac.amazon.nova-micro-v1:0
 *   set UATU_BEDROCK_REGION=ap-south-1
 *   node --import tsx apps/api/src/verify-bedrock-live.ts
 */
import { decideWithOptionalLlm, planNextAction } from "@uatu/core";

async function main() {
  const enabled = process.env.UATU_BEDROCK_ENABLED === "true";
  const modelId = process.env.UATU_BEDROCK_MODEL_ID ?? "";
  const region = process.env.UATU_BEDROCK_REGION ?? "ap-south-1";
  console.log({ enabled, modelId, region, profile: process.env.AWS_PROFILE });

  const triage = await decideWithOptionalLlm(
    { purpose: "triage", prompt: "Reply with a short prioritization note for one dependency finding." },
    "rules-fallback",
  );
  console.log("decideWithOptionalLlm:", {
    provider: triage.provider,
    usedModel: triage.usedModel,
    reasoning: triage.reasoning,
    textPreview: triage.text.slice(0, 200),
    isStub: triage.text.includes("bedrock-stub"),
  });

  const plan = await planNextAction({
    state: "TRIAGED",
    findingsCount: 2,
    findingKind: "dependency_security",
    findingSummary: "vulnerable dependency",
    availableActions: ["select_top_finding", "select_dependency", "needs_human"],
  });
  console.log("planNextAction:", plan);

  if (triage.text.includes("bedrock-stub")) {
    console.error("FAIL: bedrock-stub still present");
    process.exit(1);
  }

  if (enabled && modelId) {
    if (triage.provider === "bedrock") {
      console.log("PHASE A LIVE OK: real Bedrock provider response (not stub)");
      return;
    }
    console.log(
      [
        "PHASE A LIVE BLOCKED: Bedrock enabled but provider fell back to rules/none.",
        "Enablement steps for ap-south-1:",
        "1. Confirm AWS project Region is ap-south-1 (AWS Settings > View all projects > Overview).",
        "2. Wait for account verification to finish if you see AccessDeniedException: account being verified.",
        "3. Use an inference profile id (not bare foundation model id), e.g. apac.amazon.nova-micro-v1:0.",
        "   List: aws bedrock list-inference-profiles --region ap-south-1 --profile erebuzzz",
        "4. In Bedrock console, ensure model access for Nova/Claude in the APAC profile.",
        "5. Re-run with UATU_BEDROCK_MODEL_ID=apac.amazon.nova-micro-v1:0",
        `Observed reasoning: ${triage.reasoning}`,
      ].join("\n"),
    );
    process.exit(2);
  }

  console.log("PHASE A OFFLINE OK: Bedrock disabled; rules path used (unit tests cover live client path)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
