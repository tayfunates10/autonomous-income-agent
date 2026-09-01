import { authorizeExecution, type AuthorizationResult } from "../approval/gate.js";
import type { Capability } from "../policy/capabilities.js";
import { BudgetManager, KillSwitch, type BudgetReservation } from "./operational-guard.js";
import { NonceStore } from "./nonce-store.js";
import {
  OwnerPublicKeyRegistry,
  verifyOwnerApproval,
  type SignedOwnerApproval,
} from "./signed-approval.js";

export class SecurityControlPlane {
  constructor(
    readonly agentId: string,
    readonly killSwitch: KillSwitch,
    readonly budgets: BudgetManager,
    readonly ownerKeys: OwnerPublicKeyRegistry,
    readonly nonces: NonceStore,
  ) {
    if (agentId.trim().length === 0) throw new Error("agentId cannot be empty.");
  }

  assertOperational(): void {
    this.killSwitch.assertOperational();
  }

  authorizeHighImpact(
    actionId: string,
    capability: Capability,
    signedApproval: SignedOwnerApproval,
    now = new Date(),
  ): AuthorizationResult {
    this.assertOperational();
    const approval = verifyOwnerApproval(signedApproval, this.ownerKeys, this.nonces, {
      actionId,
      capability,
      agentId: this.agentId,
      now,
    });
    return authorizeExecution({ actionId, capability, approval, now });
  }

  authorizeAndReserveSpend(
    actionId: string,
    budgetId: string,
    amountMinor: number,
    currency: string,
    now = new Date(),
  ): BudgetReservation {
    this.assertOperational();
    const withinBudget = this.budgets.canSpend(budgetId, amountMinor, currency, now);
    const authorization = authorizeExecution({
      actionId,
      capability: "finance.spend_within_budget",
      withinBudget,
      now,
    });
    if (authorization.decision !== "allow") {
      throw new Error(`Spend authorization denied: ${authorization.reason}`);
    }
    return this.budgets.reserve(actionId, budgetId, amountMinor, currency, now);
  }
}
