import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import {
  AuthorizedChannelRegistry,
  DeterministicSandbox,
  FileCheckpointStore,
  IntegrationGateway,
  ProductionHttpsTransport,
  createHealthSnapshot,
  evaluateProductionReadiness,
  loadProductionConfig,
  resolvePinnedPublicAddress,
  validatePublicHttpsUrl,
  type IntegrationTransport,
} from "../src/index.js";

class FakeTransport implements IntegrationTransport {
  calls = 0;
  async send() {
    this.calls += 1;
    return { status: 200, body: "ok" };
  }
}

test("F-05 safe URL validation rejects non-public IPv6 literals", () => {
  assert.throws(() => validatePublicHttpsUrl("https://[fd00::1]/admin"));
  assert.throws(() => validatePublicHttpsUrl("https://[fe80::1]/admin"));
  assert.throws(() => validatePublicHttpsUrl("https://[::ffff:127.0.0.1]/admin"));
});

test("F-06 escaped PEM newlines load into a ready production config", () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const escapedPem = publicKey.export({ type: "spki", format: "pem" }).toString().replace(/\n/g, "\\n");
  const config = loadProductionConfig({
    AIA_AGENT_ID: "agent-prod",
    AIA_AGENT_DISPLAY_NAME: "Authorized AI Representative",
    AIA_OWNER_REFERENCE: "owner:primary",
    AIA_AGENT_DISCLOSURE: "AI representative acting under owner authorization.",
    AIA_OWNER_KEY_ID: "owner-key",
    AIA_OWNER_PUBLIC_KEY_PEM: escapedPem,
    AIA_BUDGET_LIMIT_MINOR: "1000",
    AIA_BUDGET_CURRENCY: "TRY",
    AIA_ALLOWED_ORIGINS: "https://api.example.com",
    AIA_CHECKPOINT_PATH: "/tmp/aia-checkpoint.json",
  });
  assert.equal(evaluateProductionReadiness(config).status, "ready");
});

test("F-07 production and recovery APIs are exported from package entrypoint", () => {
  assert.equal(typeof ProductionHttpsTransport, "function");
  assert.equal(typeof resolvePinnedPublicAddress, "function");
  assert.equal(typeof DeterministicSandbox, "function");
  assert.equal(typeof FileCheckpointStore, "function");
  assert.equal(typeof createHealthSnapshot, "function");
});

test("F-08 rejected unauthorized writes do not consume rate budget", async () => {
  const transport = new FakeTransport();
  const gateway = new IntegrationGateway(transport, new AuthorizedChannelRegistry(), {
    maxRequestsPerWindow: 2,
    windowMs: 60_000,
  });

  for (let index = 0; index < 2; index += 1) {
    await assert.rejects(() => gateway.execute({
      actionId: `bad-${index}`,
      capability: "commerce.create_offer",
      url: "https://evil.example/api",
      method: "POST",
      body: "{}",
    }, 1_000));
  }

  await gateway.execute({
    actionId: "legit",
    capability: "research.public_web",
    url: "https://example.com/market",
    method: "GET",
  }, 1_000);

  assert.equal(transport.calls, 1);
});
