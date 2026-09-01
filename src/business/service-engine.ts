import { buildPlan, type ExecutionPlan } from "../planner/plan.js";
import type { Money } from "./product-engine.js";

export interface ServiceOfferDraft {
  serviceId: string;
  title: string;
  scope: string;
  deliverables: readonly string[];
  exclusions: readonly string[];
  price: Money;
  offerCapability: "commerce.create_offer";
  contractCapability: "legal.sign_contract";
  status: "draft";
  deliveryPlan: ExecutionPlan;
}

export interface ServiceOfferInput {
  serviceId: string;
  title: string;
  scope: string;
  deliverables: readonly string[];
  exclusions?: readonly string[];
  price: Money;
}

export function createServiceOffer(input: ServiceOfferInput): ServiceOfferDraft {
  if (input.serviceId.trim().length === 0) throw new Error("serviceId cannot be empty.");
  if (input.title.trim().length === 0) throw new Error("Service title cannot be empty.");
  if (input.scope.trim().length === 0) throw new Error("Service scope cannot be empty.");
  if (input.deliverables.length === 0 || input.deliverables.some((item) => item.trim().length === 0)) {
    throw new Error("Service requires at least one non-empty deliverable.");
  }
  if (!Number.isSafeInteger(input.price.amountMinor) || input.price.amountMinor <= 0) {
    throw new Error("Service price amountMinor must be a positive safe integer.");
  }
  if (!/^[A-Z]{3}$/.test(input.price.currency)) throw new Error("Service price currency must be a three-letter uppercase code.");

  const prefix = `service:${input.serviceId}`;
  const deliveryPlan = buildPlan({
    planId: `delivery:${input.serviceId}`,
    goal: `Offer and deliver service: ${input.title}`,
    steps: [
      {
        stepId: "proposal",
        actionId: `${prefix}:proposal`,
        capability: "content.draft",
        input: { scope: input.scope, deliverables: input.deliverables },
      },
      {
        stepId: "offer",
        actionId: `${prefix}:offer`,
        capability: "commerce.create_offer",
        input: { price: input.price },
        dependsOn: ["proposal"],
      },
      {
        stepId: "agreement",
        actionId: `${prefix}:agreement`,
        capability: "legal.sign_contract",
        input: { serviceId: input.serviceId },
        dependsOn: ["offer"],
      },
      {
        stepId: "delivery",
        actionId: `${prefix}:delivery`,
        capability: "product.build",
        input: { deliverables: input.deliverables },
        dependsOn: ["agreement"],
      },
    ],
  });

  return {
    serviceId: input.serviceId,
    title: input.title.trim(),
    scope: input.scope.trim(),
    deliverables: input.deliverables.map((item) => item.trim()),
    exclusions: (input.exclusions ?? []).map((item) => item.trim()).filter(Boolean),
    price: { ...input.price },
    offerCapability: "commerce.create_offer",
    contractCapability: "legal.sign_contract",
    status: "draft",
    deliveryPlan,
  };
}
