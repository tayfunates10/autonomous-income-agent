import assert from "node:assert/strict";
import test from "node:test";
import { buildPlan, PlanValidationError } from "../src/planner/plan.js";

test("planner topologically orders dependencies and annotates policy", () => {
  const plan = buildPlan({
    planId: "plan-1",
    goal: "Research and create an offer",
    steps: [
      {
        stepId: "offer",
        actionId: "offer-1",
        capability: "commerce.create_offer",
        input: {},
        dependsOn: ["research"],
      },
      {
        stepId: "research",
        actionId: "research-1",
        capability: "research.public_web",
        input: {},
      },
      {
        stepId: "transfer",
        actionId: "transfer-1",
        capability: "finance.transfer_funds",
        input: {},
        dependsOn: ["offer"],
      },
    ],
  });

  assert.deepEqual(plan.steps.map((step) => step.stepId), ["research", "offer", "transfer"]);
  assert.equal(plan.steps[0]?.policy.decision, "allow");
  assert.equal(plan.steps[2]?.policy.decision, "require_owner_approval");
});

test("planner keeps permanently prohibited capability denied", () => {
  const plan = buildPlan({
    planId: "plan-denied",
    goal: "Validate denied capability",
    steps: [
      {
        stepId: "bad",
        actionId: "bad-1",
        capability: "identity.impersonate_human",
        input: {},
      },
    ],
  });

  assert.equal(plan.steps[0]?.policy.decision, "deny");
});

test("planner rejects dependency cycles", () => {
  assert.throws(
    () =>
      buildPlan({
        planId: "plan-cycle",
        goal: "Cycle",
        steps: [
          { stepId: "a", actionId: "a-1", capability: "content.draft", input: {}, dependsOn: ["b"] },
          { stepId: "b", actionId: "b-1", capability: "product.design", input: {}, dependsOn: ["a"] },
        ],
      }),
    PlanValidationError,
  );
});

test("planner rejects duplicate action ids", () => {
  assert.throws(
    () =>
      buildPlan({
        planId: "plan-duplicate",
        goal: "Duplicate action",
        steps: [
          { stepId: "a", actionId: "same", capability: "content.draft", input: {} },
          { stepId: "b", actionId: "same", capability: "product.design", input: {} },
        ],
      }),
    PlanValidationError,
  );
});

test("planner rejects NaN, non-integer and non-positive maxSteps instead of disabling the bound", () => {
  const oneStep = [{ stepId: "a", actionId: "a-1", capability: "content.draft" as const, input: {} }];

  for (const maxSteps of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0, -1]) {
    assert.throws(
      () => buildPlan({ planId: "bad-limit", goal: "Bounded plan", steps: oneStep, maxSteps }),
      PlanValidationError,
    );
  }
});
