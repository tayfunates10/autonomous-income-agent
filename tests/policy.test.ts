import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { authorizeExecution } from "../src/approval/gate.js";
import { evaluatePolicy } from "../src/policy/engine.js";
import { OwnerAuthorizationVerifier, signOwnerApproval } from "../src/security/owner-authorization.js";

function signedApproval(capability: "finance.transfer_funds" | "legal.sign_contract", actionId: string, approvedAt: string, expiresAt: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const verifier = new OwnerAuthorizationVerifier();
  verifier.trustKey("owner-test", publicKey.export({ format: "pem", type: "spki" }).toString());
  const approval = signOwnerApproval(
    {
      approvalId: `approval:${actionId}`,
      capability,
      actionId,
      approvedBy: "owner",
      approvedAt,
      expiresAt,
      nonce: `nonce:${actionId}`,
    },
    privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    "owner-test",
  );
  return { approval, verifier };
}

test("public research is autonomously allowed", () => {
  assert.equal(evaluatePolicy({ capability: "research.public_web" }).decision, "allow");
});

test("fund transfer requires owner approval", () => {
  assert.equal(evaluatePolicy({ capability: "finance.transfer_funds" }).decision, "require_owner_approval");
});

test("valid signed scoped approval authorizes only the matching action", () => {
  const signed = signedApproval(
    "finance.transfer_funds",
    "action-1",
    "2026-08-31T12:00:00.000Z",
    "2026-08-31T13:00:00.000Z",
  );

  const wrongAction = authorizeExecution({
    capability: "finance.transfer_funds",
    actionId: "action-2",
    approval: signed.approval,
    ownerAuthorizationVerifier: signed.verifier,
    now: new Date("2026-08-31T12:30:00.000Z"),
  });

  const allowed = authorizeExecution({
    capability: "finance.transfer_funds",
    actionId: "action-1",
    approval: signed.approval,
    ownerAuthorizationVerifier: signed.verifier,
    now: new Date("2026-08-31T12:30:00.000Z"),
  });

  assert.equal(wrongAction.decision, "require_owner_approval");
  assert.equal(allowed.decision, "allow");
  assert.equal(allowed.approvalId, "approval:action-1");
});

test("expired signed approval is rejected", () => {
  const signed = signedApproval(
    "legal.sign_contract",
    "contract-1",
    "2026-08-31T10:00:00.000Z",
    "2026-08-31T11:00:00.000Z",
  );

  assert.equal(
    authorizeExecution({
      capability: "legal.sign_contract",
      actionId: "contract-1",
      approval: signed.approval,
      ownerAuthorizationVerifier: signed.verifier,
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

test("spending outside a configured budget requires owner approval unless owner is cryptographically verified", () => {
  assert.equal(
    evaluatePolicy({ capability: "finance.spend_within_budget", withinBudget: false }).decision,
    "require_owner_approval",
  );
  assert.equal(
    evaluatePolicy({ capability: "finance.spend_within_budget", withinBudget: false, ownerApproved: true }).decision,
    "allow",
  );
});
