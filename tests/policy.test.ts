import assert from "node:assert/strict";
import test from "node:test";
import { authorizeExecution, type OwnerApprovalGrant } from "../src/approval/gate.js";
import { evaluatePolicy } from "../src/policy/engine.js";

test("public research is autonomously allowed", () => {
  assert.equal(evaluatePolicy({ capability: "research.public_web" }).decision, "allow");
});

test("fund transfer requires owner approval", () => {
  assert.equal(evaluatePolicy({ capability: "finance.transfer_funds" }).decision, "require_owner_approval");
});

test("valid scoped approval authorizes only the matching action", () => {
  const approval: OwnerApprovalGrant = {
    approvalId: "approval-1",
    capability: "finance.transfer_funds",
    actionId: "action-1",
    approvedBy: "owner",
    approvedAt: "2026-08-31T12:00:00.000Z",
    expiresAt: "2026-08-31T13:00:00.000Z",
  };

  const allowed = authorizeExecution({
    capability: "finance.transfer_funds",
    actionId: "action-1",
    approval,
    now: new Date("2026-08-31T12:30:00.000Z"),
  });

  const wrongAction = authorizeExecution({
    capability: "finance.transfer_funds",
    actionId: "action-2",
    approval,
    now: new Date("2026-08-31T12:30:00.000Z"),
  });

  assert.equal(allowed.decision, "allow");
  assert.equal(allowed.approvalId, "approval-1");
  assert.equal(wrongAction.decision, "require_owner_approval");
});

test("expired approval is rejected", () => {
  const approval: OwnerApprovalGrant = {
    approvalId: "approval-expired",
    capability: "legal.sign_contract",
    actionId: "contract-1",
    approvedBy: "owner",
    approvedAt: "2026-08-31T10:00:00.000Z",
    expiresAt: "2026-08-31T11:00:00.000Z",
  };

  assert.equal(
    authorizeExecution({
      capability: "legal.sign_contract",
      actionId: "contract-1",
      approval,
      now: new Date("2026-08-31T11:00:00.000Z"),
    }).decision,
    "require_owner_approval",
  );
});

test("permanently prohibited capabilities stay denied even with approval flag", () => {
  assert.equal(
    evaluatePolicy({ capability: "identity.forge_document", ownerApproved: true }).decision,
    "deny",
  );
});

test("publishing requires an authorized channel", () => {
  assert.equal(
    evaluatePolicy({ capability: "content.publish_authorized", channelAuthorized: false }).decision,
    "deny",
  );
  assert.equal(
    evaluatePolicy({ capability: "content.publish_authorized", channelAuthorized: true }).decision,
    "allow",
  );
});

test("spending outside a configured budget requires owner approval", () => {
  assert.equal(
    evaluatePolicy({ capability: "finance.spend_within_budget", withinBudget: false }).decision,
    "require_owner_approval",
  );
});
