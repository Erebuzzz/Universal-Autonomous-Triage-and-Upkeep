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
    ];
    for (let i = 0; i < path.length - 1; i++) {
      assert.equal(canTransition(path[i], path[i + 1]), true);
    }
  });

  it("rejects illegal jumps", () => {
    assert.equal(canTransition("DISCOVERED", "IMPLEMENTING"), false);
    assert.equal(canTransition("PR_ARTIFACT_READY", "DISCOVERED"), false);
  });
});
