#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { UatuShipItStack } from "../lib/uatu-stack";

function loadEnvFile(): void {
  const envPath = path.resolve(__dirname, "../../../.env");
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, "utf8");
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    i += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1);

    if (
      key === "UATU_GITHUB_APP_PRIVATE_KEY" &&
      value.length > 0 &&
      !value.startsWith('"') &&
      !value.startsWith("'") &&
      !value.includes("\\n") &&
      !value.includes("BEGIN")
    ) {
      const chunks = [value.trim()];
      while (i < lines.length) {
        const next = lines[i]!;
        const nt = next.trim();
        if (!nt || nt.startsWith("#")) break;
        if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(nt)) break;
        if (nt.startsWith("-----") || /^[A-Za-z0-9+/=]+$/.test(nt)) {
          chunks.push(nt);
          i += 1;
          continue;
        }
        break;
      }
      value = chunks.join("\n");
    } else {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      value = value.replace(/\\n/g, "\n");
    }

    if (process.env[key] === undefined && value !== "") {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const app = new cdk.App();
new UatuShipItStack(app, "UatuShipItStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
  },
  description: "UATU Ship It MVP - API, worker, storage, events",
});
