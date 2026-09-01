import {
  ALWAYS_DENY,
  AUTONOMOUSLY_ELIGIBLE,
  OWNER_APPROVAL_REQUIRED,
  type Capability,
} from "./capabilities.js";

export type PolicyDecision = "allow" | "require_owner_approval" | "deny";

export interface PolicyContext {
  capability: Capability;
  ownerApproved?: boolean;
  channelAuthorized?: boolean;
  withinBudget?: boolean;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

export function evaluatePolicy(context: PolicyContext): PolicyResult {
  const { capability } = context;

  if (ALWAYS_DENY.has(capability)) {
    return { decision: "deny", reason: `Capability ${capability} is permanently prohibited.` };
  }

  if (OWNER_APPROVAL_REQUIRED.has(capability)) {
    if (context.ownerApproved === true) {
      return { decision: "allow", reason: `Owner approval verified for ${capability}.` };
    }

    return {
      decision: "require_owner_approval",
      reason: `Explicit owner approval is required for ${capability}.`,
    };
  }

  if (!AUTONOMOUSLY_ELIGIBLE.has(capability)) {
    return { decision: "deny", reason: `Unknown or unclassified capability ${capability}.` };
  }

  if (
    (capability === "content.publish_authorized" || capability === "customer.respond_authorized") &&
    context.channelAuthorized !== true
  ) {
    return { decision: "deny", reason: "The target communication channel is not authorized." };
  }

  if (capability === "finance.spend_within_budget" && context.withinBudget !== true) {
    if (context.ownerApproved === true) {
      return { decision: "allow", reason: "Owner approved an over-budget spend." };
    }
    return { decision: "require_owner_approval", reason: "Spend exceeds or lacks an approved budget envelope." };
  }

  return { decision: "allow", reason: `Capability ${capability} is allowed by autonomous policy.` };
}
