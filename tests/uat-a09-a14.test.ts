import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { AuthorizedChannelRegistry } from "../src/integrations/channels.js";
import { IntegrationGateway, type IntegrationTransport } from "../src/integrations/gateway.js";
import { MemoryStore } from "../src/memory/store.js";
import { scoreOpportunity } from "../src/opportunity/scorer.js";
import { FileCheckpointStore } from "../src/recovery/file-checkpoint-store.js";
import { AgentRuntime } from "../src/runtime/agent-runtime.js";
import { ExecutorRegistry } from "../src/runtime/executor-registry.js";
import { OwnerAuthorizationVerifier, signOwnerApproval } from "../src/security/owner-authorization.js";

const okTransport: IntegrationTransport = { async send() { return { status: 200, body: "ok" }; } };

test("A-09 caller supplied timestamps cannot bypass the internal rate-limit clock", async () => {
  const channels = new AuthorizedChannelRegistry();
  let now = 1_000;
  const gateway = new IntegrationGateway(okTransport, channels, { maxRequestsPerWindow: 1, windowMs: 10_000, clock: () => now });
  const request = { actionId: "a1", capability: "research.public_web" as const, url: "https://example.com", method: "GET" as const };
  await gateway.execute(request, 1_000);
  await assert.rejects(() => gateway.execute({ ...request, actionId: "a2" }, 999_999_999), /rate limit exceeded/);
  now += 10_001;
  await gateway.execute({ ...request, actionId: "a3" }, -999_999_999);
});

test("A-10 expired owner approval nonces are pruned", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const verifier = new OwnerAuthorizationVerifier();
  verifier.trustKey("owner", publicKey.export({ type: "spki", format: "pem" }).toString());
  const approval = signOwnerApproval({ approvalId: "a", capability: "content.publish_authorized", actionId: "publish", approvedBy: "owner", approvedAt: "2026-09-02T10:00:00.000Z", expiresAt: "2026-09-02T10:01:00.000Z", nonce: "nonce-1" }, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "owner");
  assert.equal(verifier.verify(approval, { capability: "content.publish_authorized", actionId: "publish" }, new Date("2026-09-02T10:00:30.000Z")), true);
  assert.equal(verifier.usedNonceCount(new Date("2026-09-02T10:00:30.000Z")), 1);
  assert.equal(verifier.usedNonceCount(new Date("2026-09-02T10:02:00.000Z")), 0);
});

test("A-11 non-string executor errors become string TaskRunResult.error values", async () => {
  const registry = new ExecutorRegistry();
  registry.register("content.draft", async () => { throw { code: 500, reason: "boom" }; });
  const result = await new AgentRuntime(registry).run({ taskId: "t", actionId: "a", capability: "content.draft", input: {} });
  assert.equal(result.status, "failed");
  assert.equal(typeof result.error, "string");
});

test("A-12 memory limit zero is empty and invalid limits fail closed", () => {
  const store = new MemoryStore();
  store.upsert({ id: "m1", text: "hello", tags: [], confidence: 1, observedAt: "2026-09-02T10:00:00.000Z", sensitivity: "public", provenance: { sourceId: "test", sourceType: "system" } }, new Date("2026-09-02T10:01:00.000Z"));
  assert.deepEqual(store.query({ limit: 0 }), []);
  for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => store.query({ limit }));
});

test("A-13 hard ceiling preserves risk-adjusted score and exposes a separate block reason", () => {
  const result = scoreOpportunity({
    opportunityId: "opp", title: "Strong but prohibited", businessModel: "service", description: "x",
    metrics: { demand: 1, margin: 1, automationFit: 1, repeatability: 1, speedToRevenue: 1, differentiation: 1, competition: 0, platformRisk: 0, legalRisk: 0.8 },
    evidence: [{ evidenceId: "e", sourceId: "s", sourceType: "web", kind: "demand", summary: "strong demand", confidence: 1, observedAt: "2026-09-02T10:00:00.000Z" }],
  });
  assert.equal(result.decision, "discard");
  assert.ok(result.score > 0);
  assert.match(result.blockedByHardCeiling ?? "", /hard ceiling/);
});

test("A-14 checkpoint validation rejects arrays and malformed receipt containers before restore", () => {
  const store = new FileCheckpointStore("/tmp/aia-uat-a14.json");
  assert.throws(() => store.save([] as never), /plain object/);
  assert.throws(() => store.save({ runId: "r", createdAt: new Date().toISOString(), chainHash: "x", receipts: {} } as never), /receipts must be an array/);
});
