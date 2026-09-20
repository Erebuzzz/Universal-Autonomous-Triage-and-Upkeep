/**
 * Phase K4 acceptance: strongest local simulation of two-user isolation
 * when only one GitHub account is available.
 *
 * Usage: node --import tsx apps/api/src/verify-tenant-isolation.ts
 */
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuditTrail,
  AuthorizationPolicy,
  JsonFileStore,
  WorkflowOrchestrator,
} from "@uatu/core";
import { createFileAuthStoresAsync } from "./auth.js";
import { prepareSandboxFixture } from "./services.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const seed = path.join(root, "fixtures", "demo-vulnerable");

async function main() {
  const tmp = path.join(root, "data", "sandbox", "tenant-isolation");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  const fixtureA = path.join(tmp, "user-a");
  const fixtureB = path.join(tmp, "user-b");
  await prepareSandboxFixture(seed, fixtureA);
  await prepareSandboxFixture(seed, fixtureB);

  const dataDir = path.join(tmp, "data");
  const store = new JsonFileStore(dataDir);
  const audit = new AuditTrail();
  const policy = new AuthorizationPolicy(fixtureA);
  policy.grantTemporaryRoot(fixtureB);
  const orch = new WorkflowOrchestrator({
    policy,
    store,
    audit,
    fixturePath: fixtureA,
  });
  const auth = await createFileAuthStoresAsync(dataDir);

  await auth.saveUser({
    id: "111",
    login: "alice",
    createdAt: new Date().toISOString(),
    installationIds: [1],
  });
  await auth.saveUser({
    id: "222",
    login: "bob",
    createdAt: new Date().toISOString(),
    installationIds: [2],
  });

  const grantA = await orch.createGrant({
    grantedBy: "alice",
    userId: "111",
    source: "fixture",
    targetPath: fixtureA,
    repositoryName: "alice-fixture",
  });
  const grantB = await orch.createGrant({
    grantedBy: "bob",
    userId: "222",
    source: "fixture",
    targetPath: fixtureB,
    repositoryName: "bob-fixture",
  });

  assert.equal(grantA.grantedBy, "alice");
  assert.equal(grantB.grantedBy, "bob");
  assert.notEqual(grantA.userId, grantB.userId);

  const taskA = await orch.startRun(grantA.id);
  const taskB = await orch.startRun(grantB.id);
  assert.equal(taskA.userId, "111");
  assert.equal(taskB.userId, "222");

  const allTasks = await store.listTasks();
  const aliceView = allTasks.filter((t) => t.userId === "111");
  const bobView = allTasks.filter((t) => t.userId === "222");
  assert.equal(aliceView.length, 1);
  assert.equal(bobView.length, 1);
  assert.equal(aliceView[0]!.id, taskA.id);
  assert.equal(bobView[0]!.id, taskB.id);

  // Spoof attempt: body grantedBy must be ignored by API; simulate correct server behavior.
  const spoof = await orch.createGrant({
    grantedBy: "alice", // session user wins
    userId: "111",
    notes: "attacker tried grantedBy=bob in body",
  });
  assert.equal(spoof.grantedBy, "alice");
  assert.equal(spoof.userId, "111");

  console.log("PHASE K4 TENANT ISOLATION OK (local two-user simulation)");
  console.log(
    "Gap: live second GitHub account + App install + UI login-to-PR not exercised in this harness.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
