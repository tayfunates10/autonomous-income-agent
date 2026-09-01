import type { Capability } from "../policy/capabilities.js";
import { evaluatePolicy, type PolicyContext, type PolicyResult } from "../policy/engine.js";
import {
  OwnerAuthorizationVerifier,
  type SignedOwnerApproval,
} from "../security/owner-authorization.js";

export type OwnerApprovalGrant = SignedOwnerApproval;

export interface AuthorizationRequest extends Omit<PolicyContext, "ownerApproved"> {
  actionId: string;
  approval?: OwnerApprovalGrant;
  ownerAuthorizationVerifier?: OwnerAuthorizationVerifier;
  now?: Date;
}

export interface AuthorizationResult extends PolicyResult {
  approvalId?: string;
}

function isValidApproval(
  capability: Capability,
  actionId: string,
  approval: OwnerApprovalGrant | undefined,
  verifier: OwnerAuthorizationVerifier | undefined,
  now: Date,
): approval is OwnerApprovalGrant {
  if (!approval || !verifier) return false;

  try {
    return verifier.verify(approval, { capability, actionId }, now);
  } catch {
    return false;
  }
}

export function authorizeExecution(request: AuthorizationRequest): AuthorizationResult {
  const now = request.now ?? new Date();
  const validApproval = isValidApproval(
    request.capability,
    request.actionId,
    request.approval,
    request.ownerAuthorizationVerifier,
    now,
  );

  const policy = evaluatePolicy({
    capability: request.capability,
    ownerApproved: validApproval,
    ...(request.channelAuthorized === undefined ? {} : { channelAuthorized: request.channelAuthorized }),
    ...(request.withinBudget === undefined ? {} : { withinBudget: request.withinBudget }),
  });

  if (policy.decision === "allow" && validApproval && request.approval) {
    return { ...policy, approvalId: request.approval.payload.approvalId };
  }

  return policy;
}
