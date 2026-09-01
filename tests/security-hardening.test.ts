import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { authorizeExecution } from "../src/approval/gate.js";
import { createAgentIdentityProfile } from "../src/identity/agent-profile.js";
import { NonceStore } from "../src/security/nonce-store.js";
import { BudgetManager, KillSwitch } from "../src/security/operational-guard.js";
import { describeSecret } from "../src/security/secrets.js";
import {
  OwnerPublicKeyRegistry,
  signOwnerApproval,
  verifyOwnerApproval,
  type SignedApprovalPayload,
} from "../src/security/signed-approval.js";

function approvalFixture(): SignedApprovalPayload {
  return {
    approvalId: "approval-1",
    capability: "legal.sign_contract",
    actionId: "contract-42",
    approvedBy: "owner",
    approvedAt: "2026-09-01T08:00:00.000Z",
    expiresAt: "2026-09-01T09:00:00.000Z",
    nonce: "nonce-1234567890abcdef",
    issuedForAgentId: "agent-main",
  };
}

test("signed owner approval verifies scope, signature and one-time nonce", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keys = new OwnerPublicKeyRegistry();
  keys.register("owner-key-1", publicKey);
  const nonces = new NonceStore();
  const signed = signOwnerApproval(approvalFixture(), "owner-key-1", privateKey);

  const grant = verifyOwnerApproval(signed, keys, nonces, {
    actionId: "contract-42",
    capability: "legal.sign_contract",
    agentId: "agent-main",
    now: new Date("2026-09-01T08:30:00.000Z"),
  });

  const auth = authorizeExecution({
    actionId: "contract-42",
    capability: "legal.sign_contract",
    approval: grant,
    now: new Date("2026-09-01T08:30:00.000Z"),
  });
  assert.equal(auth.decision, "allow");
  assert.equal(auth.approvalId, "approval-1");

  assert.throws(() => verifyOwnerApproval(signed, keys, nonces, {
    actionId: "contract-42",
    capability: "legal.sign_contract",
    agentId: "agent-main",
    now: new Date("2026-09-01T08:31:00.000Z"),
  }));
});

test("owner key registry accepts public keys directly and derives public keys from private keys", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const keys = new OwnerPublicKeyRegistry();
  keys.register("owner-key-private-source", privateKey);
  const signed = signOwnerApproval({
    ...approvalFixture(),
    approvalId: "approval-private-source",
    nonce: "nonce-private-source-0001",
  }, "owner-key-private-source", privateKey);

  assert.doesNotThrow(() => verifyOwnerApproval(signed, keys, new NonceStore(), {
    actionId: "contract-42",
    capability: "legal.sign_contract",
    agentId: "agent-main",
    now: new Date("2026-09-01T08:30:00.000Z"),
  }));
});

test("signed approval rejects tampering and scope mismatch", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keys = new OwnerPublicKeyRegistry();
  keys.register("owner-key-1", publicKey);
  const signed = signOwnerApproval(approvalFixture(), "owner-key-1", privateKey);

  assert.throws(() => verifyOwnerApproval({
    ...signed,
    payload: { ...signed.payload, actionId: "other-action" },
  }, keys, new NonceStore(), {
    actionId: "other-action",
    capability: "legal.sign_contract",
    agentId: "agent-main",
    now: new Date("2026-09-01T08:30:00.000Z"),
  }));

  assert.throws(() => verifyOwnerApproval(signed, keys, new NonceStore(), {
    actionId: "contract-42",
    capability: "legal.sign_contract",
    agentId: "wrong-agent",
    now: new Date("2026-09-01T08:30:00.000Z"),
  }));
});

test("kill switch blocks operations until explicitly released", () => {
  const killSwitch = new KillSwitch();
  killSwitch.assertOperational();
  killSwitch.engage("owner emergency stop");
  assert.equal(killSwitch.engaged, true);
  assert.throws(() => killSwitch.assertOperational());
  killSwitch.release();
  assert.doesNotThrow(() => killSwitch.assertOperational());
});

test("budget envelopes enforce window, currency, limit and replay protection", () => {
  const budgets = new BudgetManager();
  budgets.configure({
    budgetId: "ops-september",
    currency: "TRY",
    limitMinor: 10_000,
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-10-01T00:00:00.000Z",
  });

  assert.equal(budgets.canSpend("ops-september", 6_000, "TRY", new Date("2026-09-10T10:00:00.000Z")), true);
  budgets.reserve("spend-1", "ops-september", 6_000, "TRY", new Date("2026-09-10T10:00:00.000Z"));
  assert.equal(budgets.canSpend("ops-september", 5_000, "TRY", new Date("2026-09-10T10:01:00.000Z")), false);
  assert.throws(() => budgets.reserve("spend-1", "ops-september", 1_000, "TRY", new Date("2026-09-10T10:02:00.000Z")));
  assert.equal(budgets.canSpend("ops-september", 1_000, "USD", new Date("2026-09-10T10:03:00.000Z")), false);
});

test("agent identity is explicitly disclosed as an authorized AI representative", () => {
  const profile = createAgentIdentityProfile({
    agentId: "agent-main",
    displayName: "AIA Operator",
    kind: "authorized_ai_representative",
    ownerReference: "owner:primary",
    disclosure: "Tayfun adına çalışan yetkilendirilmiş yapay zeka temsilcisidir.",
    contactChannels: ["site", "email"],
  });
  assert.equal(profile.kind, "authorized_ai_representative");
  assert.throws(() => createAgentIdentityProfile({ ...profile, disclosure: "Independent contractor" }));
});

test("secret descriptions expose references, never secret values", () => {
  const description = describeSecret({ secretId: "STORE_API_TOKEN", purpose: "authorized store publishing" });
  assert.equal(description, "[secret:STORE_API_TOKEN;purpose:authorized store publishing]");
  assert.equal(description.includes("token-value"), false);
});
