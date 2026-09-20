import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { UatuShipItStack } from "../lib/uatu-stack";

describe("UatuShipItStack", () => {
  it("synthesizes core resources", () => {
    const app = new cdk.App();
    const stack = new UatuShipItStack(app, "Test");
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.resourceCountIs("AWS::SQS::Queue", 2);
    // Api + Worker (+ optional custom-resource provider for bucket auto-delete)
    const lambdas = Object.values(
      (template.toJSON().Resources as Record<string, { Type: string }>) ?? {},
    ).filter((r) => r.Type === "AWS::Lambda::Function");
    assert.ok(lambdas.length >= 2);
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
    });
  });

  it("does not include OpenSearch", () => {
    const app = new cdk.App();
    const stack = new UatuShipItStack(app, "TestNoOs");
    const template = Template.fromStack(stack);
    const resources = template.toJSON().Resources as Record<string, { Type: string }>;
    const types = Object.values(resources).map((r) => r.Type);
    assert.equal(types.some((t) => t.includes("OpenSearch")), false);
  });
});
