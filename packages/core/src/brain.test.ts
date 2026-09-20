import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonFileStore } from "./persistence.js";
import {
  RepositoryBrain,
  brainStorageKey,
  sharedDependencyNeuronId,
} from "./brain.js";

describe("org brain + tenant isolation", () => {
  it("partitions brain files by userId", () => {
    assert.equal(brainStorageKey("demo", undefined), "demo");
    assert.equal(brainStorageKey("demo", "u1"), "tenant_u1__demo");
    assert.notEqual(brainStorageKey("demo", "u1"), brainStorageKey("demo", "u2"));
  });

  it("shares Dependency neurons across repos and elevates confidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "uatu-brain-"));
    const store = new JsonFileStore(root);
    const repoA = path.join(root, "repo-a");
    const repoB = path.join(root, "repo-b");
    await mkdir(repoA, { recursive: true });
    await mkdir(repoB, { recursive: true });
    const pkg = JSON.stringify({
      name: "sample",
      dependencies: { leftpadish: "1.0.0" },
    });
    await writeFile(path.join(repoA, "package.json"), pkg, "utf8");
    await writeFile(path.join(repoB, "package.json"), pkg, "utf8");

    const a = new RepositoryBrain(store, "repo-a", { userId: "tenant-1", organizationId: "acme" });
    const g1 = await a.initializeFromTree(repoA);
    const depId = sharedDependencyNeuronId("leftpadish");
    const before = g1.neurons.find((n) => n.id === depId)!;
    assert.ok(before);
    assert.ok(g1.neurons.some((n) => n.kind === "Organization"));

    const b = new RepositoryBrain(store, "repo-b", { userId: "tenant-1", organizationId: "acme" });
    const g2 = await b.initializeFromTree(repoB);
    const after = g2.neurons.find((n) => n.id === depId)!;
    assert.ok(after.confidence.value >= before.confidence.value);
    assert.ok(((after.payload.repositories as string[]) ?? []).length >= 2);

    const other = new RepositoryBrain(store, "repo-a", { userId: "tenant-2", organizationId: "other" });
    const isolated = await other.getGraph();
    assert.equal(isolated, undefined);
  });

  it("applies temporal decay to stale neurons", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "uatu-decay-"));
    const store = new JsonFileStore(root);
    const brain = new RepositoryBrain(store, "r1", { userId: "u", organizationId: "o" });
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await store.saveBrain({
      schemaVersion: 1,
      repositoryId: "org:o",
      userId: "u",
      organizationId: "o",
      updatedAt: old,
      neurons: [
        {
          id: "n1",
          kind: "Observation",
          label: "stale",
          status: "ACTIVE",
          confidence: { value: 0.9, rationale: "old" },
          importance: 0.5,
          recency: old,
          payload: {},
          evidenceIds: [],
        },
      ],
      synapses: [],
    });
    process.env.UATU_BRAIN_DECAY_HALF_LIFE_DAYS = "14";
    const graph = await brain.applyDecay();
    assert.ok(graph);
    assert.ok(graph!.neurons[0]!.confidence.value < 0.9);
  });
});
