import type { Capability } from "../policy/capabilities.js";
import { evaluatePolicy, type PolicyContext, type PolicyResult } from "../policy/engine.js";

export interface OwnerApprovalGrant {
  approvalId: string;
  capability: Capability;
  actionId: string;
  approvedBy: "owner";
  approvedAt: string;
  expiresAt: string;
}

export interface AuthorizationRequest extends Omit<PolicyContext, "ownerApproved"> {
  actionId: string;
  approval?: OwnerApprovalGrant;
  now?: Date;
}

export interface AuthorizationResult extends PolicyResult {
  approvalId?: string;
}

function isValidApproval(
  capability: Capability,
  actionId: string,
  approval: OwnerApprovalGrant | undefined,
  now: Date,
): approval is OwnerApprovalGrant {
  if (!approval) return false;
  if (approval.approvedBy !== "owner") return false;
  if (approval.capability !== capability) return false;
  if (approval.actionId !== actionId) return false;

  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  const current = now.getTime();

  return Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && approvedAt <= current && current < expiresAt;
}

export function authorizeExecution(request: AuthorizationRequest): AuthorizationResult {
  const now = request.now ?? new Date();
  const validApproval = isValidApproval(request.capability, request.actionId, request.approval, now);

  const policy = evaluatePolicy({
    capability: request.capability,
    ownerApproved: validApproval,
    ...(request.channelAuthorized === undefined ? {} : { channelAuthorized: request.channelAuthorized }),
    ...(request.withinBudget === undefined ? {} : { withinBudget: request.withinBudget }),
  });

  if (policy.decision === "allow" && validApproval && request.approval) {
    return { ...policy, approvalId: request.approval.approvalId };
  }

  return policy;
}
