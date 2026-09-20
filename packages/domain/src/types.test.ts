import { canTransition, type TaskState } from "./types.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("canTransition", () => {
  it("allows happy-path transitions", () => {
    const path: TaskState[] = [
      "DISCOVERED",
      "TRIAGED",
      "SELECTED",
      "MEMORY_CONTEXT_LOADED",
      "INVESTIGATING",
      "ROOT_CAUSE_VERIFIED",
      "IMPLEMENTING",
      "TESTING",
      "MEMORY_UPDATED",
      "REVIEWING",
      "READY_FOR_PR",
      "PR_ARTIFACT_READY",
      "PR_CREATED",
    ];
    for (let i = 0; i < path.length - 2; i++) {
      assert.equal(canTransition(path[i], path[i + 1]), true);
    }
    assert.equal(canTransition("READY_FOR_PR", "PR_CREATED"), true);
    assert.equal(canTransition("PR_ARTIFACT_READY", "PR_CREATED"), true);
  });

  it("rejects illegal jumps", () => {
    assert.equal(canTransition("DISCOVERED", "IMPLEMENTING"), false);
    assert.equal(canTransition("PR_CREATED", "DISCOVERED"), false);
  });
});
