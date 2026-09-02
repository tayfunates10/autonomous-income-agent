import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import * as publicApi from "../src/index.js";
import { AuthorizedChannelRegistry } from "../src/integrations/channels.js";
import { IntegrationGateway, type IntegrationTransport } from "../src/integrations/gateway.js";
import { validatePublicHttpsUrl } from "../src/integrations/safe-url.js";
import { MemoryStore } from "../src/memory/store.js";
import { buildPlan } from "../src/planner/plan.js";
import { AgentRuntime } from "../src/runtime/agent-runtime.js";
import { ExecutorRegistry } from "../src/runtime/executor-registry.js";
import { AgentKillSwitch } from "../src/security/controls.js";
import {
  OwnerAuthorizationVerifier,
  signOwnerApproval,
  type SignedOwnerApproval,
} from "../src/security/owner-authorization.js";

class FakeTransport implements IntegrationTransport {
  calls = 0;

  async send() {
    this.calls += 1;
    return { status: 200, body: "ok" };
  }
}

function ownerAuthorization() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const verifier = new OwnerAuthorizationVerifier();
  verifier.trustKey("uat-owner", publicPem);
  return { privatePem, verifier };
}

test("UAT: forged owner approval never reaches transfer executor", async () => {
  const registry = new ExecutorRegistry();
  let called = false;
  registry.register("finance.transfer_funds", async () => {
    called = true;
    return "transferred";
  });
  const owner = ownerAuthorization();
  const runtime = new AgentRuntime(registry, { ownerAuthorizationVerifier: owner.verifier });
  const forged = {
    approvalId: "forged",
    capability: "finance.transfer_funds",
    actionId: "transfer-uat",
    approvedBy: "owner",
    approvedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  } as unknown as SignedOwnerApproval;

  const result = await runtime.run({
    taskId: "uat-forged",
    actionId: "transfer-uat",
    capability: "finance.transfer_funds",
    input: { amountMinor: 1 },
    approval: forged,
  }, { now: new Date("2026-09-02T08:00:00.000Z") });

  assert.equal(result.status, "awaiting_approval");
  assert.equal(called, false);
});

test("UAT: runtime kill-switch stops executor invocation", async () => {
  const registry = new ExecutorRegistry();
  let called = false;
  registry.register("content.draft", async () => {
    called = true;
    return "draft";
  });
  const killSwitch = new AgentKillSwitch();
  killSwitch.engage("UAT emergency stop");
  const runtime = new AgentRuntime(registry, { killSwitch });

  const result = await runtime.run({
    taskId: "uat-kill",
    actionId: "uat-kill-action",
    capability: "content.draft",
    input: {},
  });

  assert.equal(result.status, "denied");
  assert.equal(called, false);
});

test("UAT: signed owner approval authorizes exact over-budget spend", async () => {
  const registry = new ExecutorRegistry();
  registry.register("finance.spend_within_budget", async () => "spent");
  const owner = ownerAuthorization();
  const runtime = new AgentRuntime(registry, { ownerAuthorizationVerifier: owner.verifier });
  const approval = signOwnerApproval({
    approvalId: "uat-over-budget",
    capability: "finance.spend_within_budget",
    actionId: "uat-over-budget-action",
    approvedBy: "owner",
    approvedAt: "2026-09-02T07:00:00.000Z",
    expiresAt: "2026-09-02T09:00:00.000Z",
    nonce: "uat-over-budget-nonce",
  }, owner.privatePem, "uat-owner");

  const result = await runtime.run<string>({
    taskId: "uat-over-budget-task",
    actionId: "uat-over-budget-action",
    capability: "finance.spend_within_budget",
    withinBudget: false,
    input: { amountMinor: 1000 },
    approval,
  }, { now: new Date("2026-09-02T08:00:00.000Z") });

  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "spent");
});

test("UAT: IPv6 non-public literals fail URL validation", () => {
  for (const url of [
    "https://[fd00::1]/admin",
    "https://[fe80::1]/admin",
    "https://[::ffff:127.0.0.1]/admin",
  ]) {
    assert.throws(() => validatePublicHttpsUrl(url));
  }
});

test("UAT: unauthorized writes do not consume legitimate rate budget", async () => {
  const channels = new AuthorizedChannelRegistry();
  channels.register({
    channelId: "store",
    displayName: "Store",
    origins: ["https://store.example.com"],
    capabilities: ["commerce.create_offer"],
    enabled: true,
  });
  const transport = new FakeTransport();
  const gateway = new IntegrationGateway(transport, channels, { maxRequestsPerWindow: 1, windowMs: 10_000 });

  await assert.rejects(() => gateway.execute({
    actionId: "bad-write",
    capability: "commerce.create_offer",
    channelId: "store",
    url: "https://evil.example/offers",
    method: "POST",
    body: "{}",
  }, 1_000));

  const response = await gateway.execute({
    actionId: "good-read",
    capability: "research.public_web",
    url: "https://example.com/research",
    method: "GET",
  }, 1_001);

  assert.equal(response.status, 200);
  assert.equal(transport.calls, 1);
});

test("UAT: invalid planner limits fail closed", () => {
  for (const maxSteps of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) {
    assert.throws(() => buildPlan({
      planId: "uat-plan",
      goal: "bounded plan",
      maxSteps,
      steps: [{ stepId: "s1", actionId: "a1", capability: "content.draft", input: {} }],
    }));
  }
});

test("UAT: already-expired memory is rejected at insertion", () => {
  const memory = new MemoryStore();
  assert.throws(() => memory.upsert({
    id: "expired-uat",
    text: "expired",
    tags: [],
    confidence: 0.5,
    observedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-01T01:00:00.000Z",
    sensitivity: "internal",
    provenance: { sourceId: "uat", sourceType: "system" },
  }, new Date("2026-09-02T08:00:00.000Z")));
  assert.equal(memory.size(), 0);
});

test("UAT: production and recovery surfaces remain exported from package entry point", () => {
  for (const symbol of [
    "loadProductionConfig",
    "evaluateProductionReadiness",
    "assertProductionReady",
    "createHealthSnapshot",
    "ProductionHttpsTransport",
    "SystemAddressResolver",
    "EnvironmentSecretValueResolver",
    "isPublicNetworkAddress",
    "resolvePinnedPublicAddress",
    "DeterministicSandbox",
    "FileCheckpointStore",
  ]) {
    assert.ok(symbol in publicApi, `${symbol} must be exported from src/index.ts`);
  }
});
