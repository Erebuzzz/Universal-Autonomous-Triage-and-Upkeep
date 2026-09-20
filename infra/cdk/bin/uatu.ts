#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { UatuShipItStack } from "../lib/uatu-stack";

const app = new cdk.App();
new UatuShipItStack(app, "UatuShipItStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
  },
  description: "UATU Ship It MVP — API, worker, storage, events",
});
