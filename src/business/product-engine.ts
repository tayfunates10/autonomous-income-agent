import type { OpportunityCandidate, OpportunityScore } from "../opportunity/model.js";
import { buildPlan, type ExecutionPlan } from "../planner/plan.js";

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ProductBlueprint {
  offerId: string;
  opportunityId: string;
  title: string;
  description: string;
  businessModel: "api" | "digital_product" | "micro_saas";
  price: Money;
  evidenceIds: readonly string[];
  status: "draft";
  launchPlan: ExecutionPlan;
}

function validateMoney(price: Money): void {
  if (!Number.isSafeInteger(price.amountMinor) || price.amountMinor <= 0) {
    throw new Error("Product price amountMinor must be a positive safe integer.");
  }
  if (!/^[A-Z]{3}$/.test(price.currency)) throw new Error("Product price currency must be a three-letter uppercase code.");
}

export function createProductBlueprint(
  candidate: OpportunityCandidate,
  assessment: OpportunityScore,
  price: Money,
): ProductBlueprint {
  if (candidate.opportunityId !== assessment.opportunityId) {
    throw new Error("Opportunity candidate and assessment IDs must match.");
  }
  if (assessment.decision !== "pursue") {
    throw new Error("Only a pursued opportunity can become a product blueprint.");
  }
  if (!(["api", "digital_product", "micro_saas"] as const).includes(candidate.businessModel as "api" | "digital_product" | "micro_saas")) {
    throw new Error(`Business model ${candidate.businessModel} is not a product model.`);
  }
  validateMoney(price);

  const offerId = `offer:${candidate.opportunityId}`;
  const launchPlan = buildPlan({
    planId: `launch:${candidate.opportunityId}`,
    goal: `Build a validated product offer for ${candidate.title}`,
    steps: [
      {
        stepId: "design",
        actionId: `${offerId}:design`,
        capability: "product.design",
        input: { opportunityId: candidate.opportunityId, evidenceIds: candidate.evidence.map((item) => item.evidenceId) },
      },
      {
        stepId: "build",
        actionId: `${offerId}:build`,
        capability: "product.build",
        input: { opportunityId: candidate.opportunityId },
        dependsOn: ["design"],
      },
      {
        stepId: "copy",
        actionId: `${offerId}:copy`,
        capability: "content.draft",
        input: { opportunityId: candidate.opportunityId, instruction: "Draft evidence-grounded offer copy." },
        dependsOn: ["build"],
      },
      {
        stepId: "offer",
        actionId: `${offerId}:create`,
        capability: "commerce.create_offer",
        input: { opportunityId: candidate.opportunityId, price },
        dependsOn: ["copy"],
      },
    ],
  });

  return {
    offerId,
    opportunityId: candidate.opportunityId,
    title: candidate.title,
    description: candidate.description,
    businessModel: candidate.businessModel as "api" | "digital_product" | "micro_saas",
    price: { ...price },
    evidenceIds: candidate.evidence.map((item) => item.evidenceId),
    status: "draft",
    launchPlan,
  };
}
