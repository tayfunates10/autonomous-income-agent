import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOutcome } from "../src/evaluator/evaluator.js";

test("evaluator accepts strong outcomes", () => {
  const result = evaluateOutcome({
    criteria: [
      { name: "quality", score: 0.9, weight: 2, hardMinimum: 0.7 },
      { name: "profitability", score: 0.8, weight: 1 },
    ],
  });

  assert.equal(result.decision, "accept");
  assert.ok(result.weightedScore >= 0.8);
});

test("evaluator requests revision for middling weighted score", () => {
  const result = evaluateOutcome({
    criteria: [
      { name: "quality", score: 0.7, weight: 1 },
      { name: "conversion", score: 0.6, weight: 1 },
    ],
    acceptThreshold: 0.8,
    reviseThreshold: 0.6,
  });

  assert.equal(result.decision, "revise");
});

test("hard minimum failure rejects even when weighted score is otherwise high", () => {
  const result = evaluateOutcome({
    criteria: [
      { name: "compliance", score: 0.5, weight: 1, hardMinimum: 0.9 },
      { name: "quality", score: 1, weight: 9 },
    ],
  });

  assert.equal(result.decision, "reject");
  assert.deepEqual(result.failedHardMinimums, ["compliance"]);
});
