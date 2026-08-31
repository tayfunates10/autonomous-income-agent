import assert from "node:assert/strict";
import test from "node:test";
import { verifyAuditChain } from "../src/audit/hash-chain.js";
import { AgentRuntime } from "../src/runtime/agent-runtime.js";
import { ExecutorRegistry, TransientExecutionError } from "../src/runtime/executor-registry.js";

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

test("owner-gated task pauses until a valid matching approval exists", async () => {
  const registry = new ExecutorRegistry();
  registry.register("finance.transfer_funds", async () => "transferred");
  const runtime = new AgentRuntime(registry);

  const waiting = await runtime.run({
    taskId: "task-transfer-1",
    actionId: "transfer-1",
    capability: "finance.transfer_funds",
    input: { amount: 100 },
  });

  const approved = await runtime.run<string>(
    {
      taskId: "task-transfer-2",
      actionId: "transfer-1",
      capability: "finance.transfer_funds",
      input: { amount: 100 },
      approval: {
        approvalId: "approval-transfer-1",
        capability: "finance.transfer_funds",
        actionId: "transfer-1",
        approvedBy: "owner",
        approvedAt: "2026-08-31T12:00:00.000Z",
        expiresAt: "2026-08-31T13:00:00.000Z",
      },
    },
    { now: new Date("2026-08-31T12:30:00.000Z") },
  );

  assert.equal(waiting.status, "awaiting_approval");
  assert.equal(approved.status, "succeeded");
  assert.equal(approved.output, "transferred");
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
