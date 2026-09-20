import assert from "node:assert/strict";
import { test } from "node:test";
import { inclusiveRange } from "../src/range.js";

test("inclusiveRange includes both bounds", () => {
  assert.deepEqual(inclusiveRange(1, 3), [1, 2, 3]);
});

test("inclusiveRange single value when start equals end", () => {
  assert.deepEqual(inclusiveRange(5, 5), [5]);
});
