import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceGroundedContent } from "../src/business/content-engine.js";
import { createProductBlueprint } from "../src/business/product-engine.js";
import { createServiceOffer } from "../src/business/service-engine.js";
import type { OpportunityCandidate } from "../src/opportunity/model.js";
import { scoreOpportunity } from "../src/opportunity/scorer.js";

function productCandidate(): OpportunityCandidate {
  return {
    opportunityId: "product-1",
    title: "Automation SaaS",
    businessModel: "micro_saas",
    description: "Automates a repeatable paid workflow.",
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
      { evidenceId: "e1", sourceId: "s1", sourceType: "web", kind: "demand", summary: "Demand", confidence: 0.9, observedAt: "2026-08-31T12:00:00.000Z" },
      { evidenceId: "e2", sourceId: "s2", sourceType: "web", kind: "buyer_intent", summary: "Intent", confidence: 0.9, observedAt: "2026-08-31T12:01:00.000Z" },
      { evidenceId: "e3", sourceId: "s3", sourceType: "web", kind: "price", summary: "Price", confidence: 0.9, observedAt: "2026-08-31T12:02:00.000Z" },
    ],
  };
}

test("product blueprint only accepts pursued product opportunities", () => {
  const candidate = productCandidate();
  const assessment = scoreOpportunity(candidate);
  const blueprint = createProductBlueprint(candidate, assessment, { amountMinor: 49900, currency: "TRY" });

  assert.equal(blueprint.status, "draft");
  assert.deepEqual(blueprint.launchPlan.steps.map((step) => step.stepId), ["design", "build", "copy", "offer"]);
  assert.ok(blueprint.launchPlan.steps.every((step) => step.policy.decision === "allow"));
});

test("service workflow keeps legal agreement behind owner approval", () => {
  const service = createServiceOffer({
    serviceId: "svc-1",
    title: "Website automation setup",
    scope: "Configure and deliver an automation workflow.",
    deliverables: ["Configured workflow", "Delivery report"],
    exclusions: ["Third-party subscription fees"],
    price: { amountMinor: 250000, currency: "TRY" },
  });

  const agreement = service.deliveryPlan.steps.find((step) => step.stepId === "agreement");
  assert.equal(agreement?.policy.decision, "require_owner_approval");
});

test("evidence claims require available evidence IDs", () => {
  assert.throws(() =>
    createEvidenceGroundedContent({
      contentId: "c1",
      title: "Market note",
      audience: "buyers",
      availableEvidenceIds: ["e1"],
      sections: [{ sectionId: "claim", kind: "evidence_claim", text: "Demand exists." }],
    }),
  );

  const draft = createEvidenceGroundedContent({
    contentId: "c2",
    title: "Market note",
    audience: "buyers",
    availableEvidenceIds: ["e1"],
    sections: [
      { sectionId: "claim", kind: "evidence_claim", text: "Demand signal observed.", evidenceIds: ["e1"] },
      { sectionId: "cta", kind: "cta", text: "Request details." },
    ],
  });

  assert.deepEqual(draft.usedEvidenceIds, ["e1"]);
  assert.equal(draft.status, "draft");
});
