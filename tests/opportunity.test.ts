import assert from "node:assert/strict";
import test from "node:test";
import { OpportunityEngine } from "../src/opportunity/engine.js";
import type { OpportunityCandidate } from "../src/opportunity/model.js";
import { scoreOpportunity } from "../src/opportunity/scorer.js";

function strongCandidate(id = "strong"): OpportunityCandidate {
  return {
    opportunityId: id,
    title: "Automated design micro SaaS",
    businessModel: "micro_saas",
    description: "Recurring software workflow for a proven design problem.",
    metrics: {
      demand: 0.95,
      margin: 0.9,
      automationFit: 0.95,
      repeatability: 0.9,
      speedToRevenue: 0.85,
      differentiation: 0.8,
      competition: 0.2,
      platformRisk: 0.05,
      legalRisk: 0.05,
    },
    evidence: [
      {
        evidenceId: "demand-1",
        sourceId: "source-a",
        sourceType: "web",
        kind: "demand",
        summary: "Repeated demand signal",
        confidence: 0.9,
        observedAt: "2026-08-31T12:00:00.000Z",
      },
      {
        evidenceId: "buyer-1",
        sourceId: "source-b",
        sourceType: "web",
        kind: "buyer_intent",
        summary: "Buyer intent signal",
        confidence: 0.85,
        observedAt: "2026-08-31T12:05:00.000Z",
      },
      {
        evidenceId: "price-1",
        sourceId: "source-c",
        sourceType: "web",
        kind: "price",
        summary: "Comparable paid products exist",
        confidence: 0.95,
        observedAt: "2026-08-31T12:10:00.000Z",
      },
    ],
  };
}

test("strong evidence-backed opportunity is pursued", () => {
  const result = scoreOpportunity(strongCandidate());
  assert.equal(result.decision, "pursue");
  assert.ok(result.score >= 0.72);
  assert.ok(result.evidenceQuality >= 0.6);
});

test("unsupported opportunity is discarded", () => {
  const candidate = { ...strongCandidate("unsupported"), evidence: [] };
  const result = scoreOpportunity(candidate);
  assert.equal(result.decision, "discard");
  assert.equal(result.score, 0);
});

test("hard legal risk ceiling overrides otherwise strong economics without erasing score", () => {
  const candidate = strongCandidate("risky");
  candidate.metrics.legalRisk = 0.85;
  const result = scoreOpportunity(candidate);
  assert.equal(result.decision, "discard");
  assert.ok(result.score > 0);
  assert.match(result.blockedByHardCeiling ?? "", /hard ceiling/);
});

test("engine ranks, stores evidence provenance and builds validation plan", () => {
  const engine = new OpportunityEngine();
  const strong = strongCandidate("a-strong");
  const weak: OpportunityCandidate = {
    ...strongCandidate("z-weak"),
    metrics: {
      demand: 0.4,
      margin: 0.4,
      automationFit: 0.5,
      repeatability: 0.3,
      speedToRevenue: 0.4,
      differentiation: 0.2,
      competition: 0.8,
      platformRisk: 0.2,
      legalRisk: 0.2,
    },
  };

  const ranked = engine.rank([weak, strong]);
  assert.equal(ranked[0]?.candidate.opportunityId, "a-strong");
  assert.equal(engine.memory().query({ tags: ["a-strong"] }).length, 3);

  const plan = engine.createValidationPlan(strong);
  assert.deepEqual(plan.steps.map((step) => step.stepId), ["competition", "demand", "pricing", "summary"]);
  assert.equal(plan.steps.at(-1)?.policy.decision, "allow");
});
