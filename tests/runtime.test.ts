import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { verifyAuditChain } from "../src/audit/hash-chain.js";
import { AgentRuntime } from "../src/runtime/agent-runtime.js";
import { ExecutorRegistry, TransientExecutionError } from "../src/runtime/executor-registry.js";
import { AgentKillSwitch } from "../src/security/controls.js";
import {
  OwnerAuthorizationVerifier,
  signOwnerApproval,
  type SignedOwnerApproval,
} from "../src/security/owner-authorization.js";

function ownerAuthorization() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const verifier = new OwnerAuthorizationVerifier();
  verifier.trustKey("owner-test", publicPem);
  return { privatePem, verifier };
}

test("allowed task executes through the registered capability executor", async () => {
  const registry = new ExecutorRegistry();
  registry.register("research.public_web", async (input) => ({ received: input }));
  const runtime = new AgentRuntime(registry);

  const result = await runtime.run<{ received: unknown }>({
    taskId: "task-1",
    actionId: "action-1",
    capability: "research.public_web",
    input: { query: "market signal" },
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.output, { received: { query: "market signal" } });
  assert.equal(verifyAuditChain(result.audit), true);
});

test("permanently denied task never reaches an executor", async () => {
  const registry = new ExecutorRegistry();
  let called = false;
  registry.register("identity.forge_document", async () => {
    called = true;
    return null;
  });
  const runtime = new AgentRuntime(registry);

  const result = await runtime.run({
    taskId: "task-denied",
    actionId: "action-denied",
    capability: "identity.forge_document",
    input: {},
  });

  assert.equal(result.status, "denied");
  assert.equal(called, false);
});

test("owner-gated task pauses until a valid signed matching approval exists", async () => {
  const registry = new ExecutorRegistry();
  registry.register("finance.transfer_funds", async () => "transferred");
  const owner = ownerAuthorization();
  const runtime = new AgentRuntime(registry, { ownerAuthorizationVerifier: owner.verifier });

  const waiting = await runtime.run({
    taskId: "task-transfer-1",
    actionId: "transfer-1",
    capability: "finance.transfer_funds",
    input: { amount: 100 },
  });

  const approval = signOwnerApproval(
    {
      approvalId: "approval-transfer-1",
      capability: "finance.transfer_funds",
      actionId: "transfer-1",
      approvedBy: "owner",
      approvedAt: "2026-08-31T12:00:00.000Z",
      expiresAt: "2026-08-31T13:00:00.000Z",
      nonce: "transfer-nonce-1",
    },
    owner.privatePem,
    "owner-test",
  );

  const approved = await runtime.run<string>(
    {
      taskId: "task-transfer-2",
      actionId: "transfer-1",
      capability: "finance.transfer_funds",
      input: { amount: 100 },
      approval,
    },
    { now: new Date("2026-08-31T12:30:00.000Z") },
  );

  assert.equal(waiting.status, "awaiting_approval");
  assert.equal(approved.status, "succeeded");
  assert.equal(approved.output, "transferred");
  assert.equal(approved.audit.at(-1)?.timestamp, "2026-08-31T12:30:00.000Z");
});

test("forged structural owner approval cannot authorize a transfer", async () => {
  const registry = new ExecutorRegistry();
  let called = false;
  registry.register("finance.transfer_funds", async () => {
    called = true;
    return "transferred";
  });
  const owner = ownerAuthorization();
  const runtime = new AgentRuntime(registry, { ownerAuthorizationVerifier: owner.verifier });
  const forged = {
    approvalId: "totally-legit",
    capability: "finance.transfer_funds",
    actionId: "act-evil-1",
    approvedBy: "owner",
    approvedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  } as unknown as SignedOwnerApproval;

  const result = await runtime.run(
    {
      taskId: "t-evil",
      actionId: "act-evil-1",
      capability: "finance.transfer_funds",
      input: { amountMinor: 5_000_000, to: "attacker-iban" },
      approval: forged,
    },
    { now: new Date("2026-09-01T12:00:00.000Z") },
  );

  assert.equal(result.status, "awaiting_approval");
  assert.equal(called, false);
  assert.equal(result.audit.some((event) => event.reason.includes("Owner approval verified")), false);
});

test("owner kill switch blocks runtime execution and records a deny decision", async () => {
  const registry = new ExecutorRegistry();
  let called = false;
  registry.register("content.draft", async () => {
    called = true;
    return "draft";
  });
  const killSwitch = new AgentKillSwitch();
  const runtime = new AgentRuntime(registry, { killSwitch });
  killSwitch.engage("owner halted all autonomous operation");

  const result = await runtime.run(
    { taskId: "kill-task", actionId: "kill-action", capability: "content.draft", input: {} },
    { now: new Date("2026-09-01T12:00:00.000Z") },
  );

  assert.equal(result.status, "denied");
  assert.equal(called, false);
  assert.match(result.error ?? "", /kill-switch/i);
  assert.equal(result.audit.at(-1)?.decision, "deny");
});

test("signed owner approval can authorize an over-budget spend", async () => {
  const registry = new ExecutorRegistry();
  registry.register("finance.spend_within_budget", async () => "spent");
  const owner = ownerAuthorization();
  const runtime = new AgentRuntime(registry, { ownerAuthorizationVerifier: owner.verifier });
  const approval = signOwnerApproval(
    {
      approvalId: "approval-overspend-1",
      capability: "finance.spend_within_budget",
      actionId: "overspend-1",
      approvedBy: "owner",
      approvedAt: "2026-09-01T11:00:00.000Z",
      expiresAt: "2026-09-01T13:00:00.000Z",
      nonce: "overspend-nonce-1",
    },
    owner.privatePem,
    "owner-test",
  );

  const result = await runtime.run<string>(
    {
      taskId: "overspend-task",
      actionId: "overspend-1",
      capability: "finance.spend_within_budget",
      withinBudget: false,
      input: { amountMinor: 5000 },
      approval,
    },
    { now: new Date("2026-09-01T12:00:00.000Z") },
  );

  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "spent");
});

test("transient failures retry only within the configured bound", async () => {
  const registry = new ExecutorRegistry();
  let calls = 0;
  registry.register("product.build", async () => {
    calls += 1;
    if (calls < 3) throw new TransientExecutionError("temporary dependency failure");
    return "built";
  });
  const runtime = new AgentRuntime(registry);

  const result = await runtime.run<string>(
    {
      taskId: "task-build",
      actionId: "build-1",
      capability: "product.build",
      input: {},
    },
    { maxRetries: 2 },
  );

  assert.equal(result.status, "succeeded");
  assert.equal(result.attempts, 3);
  assert.equal(calls, 3);
});

test("completed action id is rejected on replay", async () => {
  const registry = new ExecutorRegistry();
  let calls = 0;
  registry.register("content.draft", async () => {
    calls += 1;
    return "draft";
  });
  const runtime = new AgentRuntime(registry);
  const task = {
    taskId: "task-draft",
    actionId: "draft-action-1",
    capability: "content.draft" as const,
    input: {},
  };

  const first = await runtime.run(task);
  const replay = await runtime.run({ ...task, taskId: "task-draft-replay" });

  assert.equal(first.status, "succeeded");
  assert.equal(replay.status, "rejected_duplicate");
  assert.equal(calls, 1);
});

test("pre-aborted signal cancels before executor invocation", async () => {
  const registry = new ExecutorRegistry();
  let called = false;
  registry.register("commerce.create_offer", async () => {
    called = true;
    return "offer";
  });
  const runtime = new AgentRuntime(registry);
  const controller = new AbortController();
  controller.abort();

  const result = await runtime.run(
    {
      taskId: "task-cancelled",
      actionId: "offer-1",
      capability: "commerce.create_offer",
      input: {},
    },
    { signal: controller.signal },
  );

  assert.equal(result.status, "cancelled");
  assert.equal(result.attempts, 0);
  assert.equal(called, false);
});
