import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { createAgentIdentityProfile } from "../src/identity/profile.js";
import { AgentKillSwitch, SpendBudgetGuard, validateSecretReference } from "../src/security/controls.js";
import { OwnerAuthorizationVerifier, signOwnerApproval } from "../src/security/owner-authorization.js";

function ownerKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

test("signed owner approval verifies scope, expiry and one-time nonce", () => {
  const keys = ownerKeys();
  const verifier = new OwnerAuthorizationVerifier();
  verifier.trustKey("owner-2026", keys.publicPem);
  const approval = signOwnerApproval(
    {
      approvalId: "ap-1",
      capability: "legal.sign_contract",
      actionId: "contract-42",
      approvedBy: "owner",
      approvedAt: "2026-09-01T08:00:00.000Z",
      expiresAt: "2026-09-01T09:00:00.000Z",
      nonce: "nonce-1",
    },
    keys.privatePem,
    "owner-2026",
  );

  assert.equal(
    verifier.verify(approval, { capability: "legal.sign_contract", actionId: "contract-42" }, new Date("2026-09-01T08:30:00.000Z")),
    true,
  );
  assert.equal(
    verifier.verify(approval, { capability: "legal.sign_contract", actionId: "contract-42" }, new Date("2026-09-01T08:31:00.000Z")),
    false,
  );
});

test("signed approval rejects wrong action and expired windows", () => {
  const keys = ownerKeys();
  const verifier = new OwnerAuthorizationVerifier();
  verifier.trustKey("owner", keys.publicPem);
  const approval = signOwnerApproval(
    {
      approvalId: "ap-2",
      capability: "finance.transfer_funds",
      actionId: "transfer-1",
      approvedBy: "owner",
      approvedAt: "2026-09-01T08:00:00.000Z",
      expiresAt: "2026-09-01T08:05:00.000Z",
      nonce: "nonce-2",
    },
    keys.privatePem,
    "owner",
  );
  assert.equal(verifier.verify(approval, { capability: "finance.transfer_funds", actionId: "transfer-2" }, new Date("2026-09-01T08:01:00.000Z")), false);
  assert.equal(verifier.verify(approval, { capability: "finance.transfer_funds", actionId: "transfer-1" }, new Date("2026-09-01T08:06:00.000Z")), false);
});

test("kill switch blocks execution until owner release", () => {
  const killSwitch = new AgentKillSwitch();
  killSwitch.assertOperational();
  killSwitch.engage("owner emergency stop");
  assert.throws(() => killSwitch.assertOperational());
  killSwitch.release();
  killSwitch.assertOperational();
});

test("budget guard refuses overspend and secret references never contain inline values", () => {
  const budget = new SpendBudgetGuard(1000);
  assert.equal(budget.reserve(800), true);
  assert.equal(budget.reserve(300), false);
  assert.equal(budget.remainingMinor, 200);
  budget.release(300);
  assert.equal(budget.remainingMinor, 500);

  assert.deepEqual(validateSecretReference({ provider: "vault", name: "payments/api-token" }), {
    provider: "vault",
    name: "payments/api-token",
  });
  assert.deepEqual(validateSecretReference({ provider: "environment", name: "AIA_PAYMENT_TOKEN" }), {
    provider: "environment",
    name: "AIA_PAYMENT_TOKEN",
  });
  assert.throws(() => validateSecretReference({ provider: "environment", name: "TOKEN=plaintext" }));
  assert.throws(() => validateSecretReference({ provider: "environment", name: "credential=hunter2" }));
  assert.throws(() => validateSecretReference({ provider: "environment", name: "sk-proj-9f3a2b1c8d7e" }));
  assert.throws(() => validateSecretReference({ provider: "environment", name: "AKIAIOSFODNN7EXAMPLE" }));
});

test("agent identity must disclose AI status and cannot pose as a human", () => {
  const profile = createAgentIdentityProfile({
    agentId: "agent-1",
    displayName: "Income Agent",
    ownerReference: "authorized-owner",
    disclosure: "AI representative operating on behalf of its owner; not a human.",
  });
  assert.match(profile.disclosure, /AI/);
  assert.throws(() =>
    createAgentIdentityProfile({
      agentId: "agent-2",
      displayName: "Fake Human",
      ownerReference: "owner",
      disclosure: "I am a human sales representative.",
    }),
  );
});
