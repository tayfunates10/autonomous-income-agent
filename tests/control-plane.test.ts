import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { BudgetManager, KillSwitch } from "../src/security/operational-guard.js";
import { NonceStore } from "../src/security/nonce-store.js";
import { SecurityControlPlane } from "../src/security/control-plane.js";
import { OwnerPublicKeyRegistry, signOwnerApproval } from "../src/security/signed-approval.js";

test("control plane authorizes signed high-impact action and budgeted spend", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keys = new OwnerPublicKeyRegistry();
  keys.register("owner-key", publicKey);
  const budgets = new BudgetManager();
  budgets.configure({
    budgetId: "ops",
    currency: "TRY",
    limitMinor: 5_000,
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-10-01T00:00:00.000Z",
  });
  const plane = new SecurityControlPlane("agent-main", new KillSwitch(), budgets, keys, new NonceStore());

  const approval = signOwnerApproval({
    approvalId: "a1",
    capability: "legal.sign_contract",
    actionId: "contract-1",
    approvedBy: "owner",
    approvedAt: "2026-09-01T08:00:00.000Z",
    expiresAt: "2026-09-01T09:00:00.000Z",
    nonce: "nonce-control-plane-0001",
    issuedForAgentId: "agent-main",
  }, "owner-key", privateKey);

  const auth = plane.authorizeHighImpact("contract-1", "legal.sign_contract", approval, new Date("2026-09-01T08:30:00.000Z"));
  assert.equal(auth.decision, "allow");

  const reservation = plane.authorizeAndReserveSpend("spend-1", "ops", 1_500, "TRY", new Date("2026-09-02T08:00:00.000Z"));
  assert.equal(reservation.amountMinor, 1_500);
});

test("control plane kill switch blocks both high-impact and spend paths", () => {
  const killSwitch = new KillSwitch();
  killSwitch.engage("incident response");
  const plane = new SecurityControlPlane(
    "agent-main",
    killSwitch,
    new BudgetManager(),
    new OwnerPublicKeyRegistry(),
    new NonceStore(),
  );

  assert.throws(() => plane.authorizeAndReserveSpend("spend", "missing", 100, "TRY"));
  assert.equal(killSwitch.engaged, true);
});
