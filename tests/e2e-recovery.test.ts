import assert from "node:assert/strict";
import test from "node:test";
import { createProductBlueprint } from "../src/business/product-engine.js";
import { AuthorizedChannelRegistry } from "../src/integrations/channels.js";
import { IntegrationGateway, type IntegrationRequest, type IntegrationTransportResponse } from "../src/integrations/gateway.js";
import type { OpportunityCandidate } from "../src/opportunity/model.js";
import { scoreOpportunity } from "../src/opportunity/scorer.js";
import { RevenueLedger } from "../src/revenue/ledger.js";
import { AgentRuntime } from "../src/runtime/agent-runtime.js";
import { ExecutorRegistry } from "../src/runtime/executor-registry.js";
import { SandboxTransport } from "../src/testing/sandbox-transport.js";
import { verifyAuditChain } from "../src/audit/hash-chain.js";

function candidate(): OpportunityCandidate {
  return {
    opportunityId: "e2e-opportunity",
    title: "Evidence-backed micro SaaS",
    businessModel: "micro_saas",
    description: "A repeatable business workflow automation.",
    metrics: {
      demand: 0.95,
      margin: 0.9,
      automationFit: 0.95,
      repeatability: 0.9,
      speedToRevenue: 0.85,
      differentiation: 0.8,
      competition: 0.2,
      platformRisk: 0.05,
      legalRisk: 0.05,
    },
    evidence: [
      { evidenceId: "e1", sourceId: "market", sourceType: "web", kind: "demand", summary: "Demand signal", confidence: 0.92, observedAt: "2026-09-01T07:00:00.000Z" },
      { evidenceId: "e2", sourceId: "buyers", sourceType: "web", kind: "buyer_intent", summary: "Buyer intent", confidence: 0.9, observedAt: "2026-09-01T07:01:00.000Z" },
      { evidenceId: "e3", sourceId: "pricing", sourceType: "web", kind: "price", summary: "Price evidence", confidence: 0.88, observedAt: "2026-09-01T07:02:00.000Z" },
    ],
  };
}

test("sandbox E2E survives transient integration fault, records revenue and rejects replay after restart", async () => {
  const opportunity = candidate();
  const score = scoreOpportunity(opportunity);
  assert.equal(score.decision, "pursue");
  const blueprint = createProductBlueprint(opportunity, score, { amountMinor: 49_900, currency: "TRY" });

  const channels = new AuthorizedChannelRegistry();
  channels.register({
    channelId: "sandbox-store",
    displayName: "Sandbox Store",
    origins: ["https://store.example.com"],
    capabilities: ["commerce.create_offer"],
    enabled: true,
  });

  const transport = new SandboxTransport();
  transport.route("POST", "https://store.example.com/api/offers", [
    { kind: "transient_error", message: "sandbox upstream timeout" },
    { kind: "response", response: { status: 201, body: JSON.stringify({ offerId: blueprint.offerId }) } },
  ]);
  const gateway = new IntegrationGateway(transport, channels);

  const registry = new ExecutorRegistry();
  registry.register("commerce.create_offer", async (input) => gateway.execute(input as IntegrationRequest));
  const runtime = new AgentRuntime(registry);

  const task = {
    taskId: "task-offer",
    actionId: `${blueprint.offerId}:publish`,
    capability: "commerce.create_offer" as const,
    input: {
      actionId: `${blueprint.offerId}:publish`,
      capability: "commerce.create_offer" as const,
      channelId: "sandbox-store",
      url: "https://store.example.com/api/offers",
      method: "POST" as const,
      body: JSON.stringify({ title: blueprint.title, price: blueprint.price }),
    },
  };

  const result = await runtime.run<IntegrationTransportResponse>(task, { maxRetries: 1 });
  assert.equal(result.status, "succeeded");
  assert.equal(result.attempts, 2);
  assert.equal(result.output?.status, 201);
  assert.equal(transport.calls.length, 2);
  assert.equal(verifyAuditChain(result.audit), true);

  const ledger = new RevenueLedger();
  ledger.add({
    entryId: "sale-e2e-1",
    type: "revenue",
    amountMinor: blueprint.price.amountMinor,
    currency: blueprint.price.currency,
    category: "sandbox-sale",
    sourceId: blueprint.offerId,
    occurredAt: "2026-09-01T08:00:00.000Z",
  });
  assert.equal(ledger.summary("TRY").netMinor, 49_900);

  const snapshot = runtime.createSnapshot();
  const restarted = new AgentRuntime(registry, snapshot);
  const replay = await restarted.run(task);
  assert.equal(replay.status, "rejected_duplicate");
  assert.equal(transport.calls.length, 2);
  assert.equal(verifyAuditChain(replay.audit), true);
});

test("runtime refuses a tampered recovery snapshot", async () => {
  const registry = new ExecutorRegistry();
  registry.register("research.public_web", async () => ({ ok: true }));
  const runtime = new AgentRuntime(registry);
  const result = await runtime.run({
    taskId: "research-task",
    actionId: "research-action",
    capability: "research.public_web",
    input: {},
  });
  assert.equal(result.status, "succeeded");

  const snapshot = runtime.createSnapshot();
  const tampered = {
    ...snapshot,
    audit: snapshot.audit.map((event, index) => index === 0 ? { ...event, reason: "tampered" } : event),
  };
  assert.throws(() => new AgentRuntime(registry, tampered));
});
