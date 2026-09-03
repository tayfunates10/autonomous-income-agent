import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizedChannelRegistry } from "../src/integrations/channels.js";
import { IntegrationGateway, type IntegrationTransport } from "../src/integrations/gateway.js";
import { validatePublicHttpsUrl } from "../src/integrations/safe-url.js";

class FakeTransport implements IntegrationTransport {
  calls: Array<{ url: string; method: string; body?: string }> = [];

  async send(request: Parameters<IntegrationTransport["send"]>[0]) {
    this.calls.push({ url: request.url, method: request.method, ...(request.body === undefined ? {} : { body: request.body }) });
    return { status: 200, body: "ok" };
  }
}

test("safe URL validation rejects insecure, credentialed and private targets", () => {
  assert.throws(() => validatePublicHttpsUrl("http://example.com"));
  assert.throws(() => validatePublicHttpsUrl("https://user:pass@example.com"));
  assert.throws(() => validatePublicHttpsUrl("https://localhost/api"));
  assert.throws(() => validatePublicHttpsUrl("https://127.0.0.1/api"));
  assert.throws(() => validatePublicHttpsUrl("https://192.168.1.10/api"));
  assert.equal(validatePublicHttpsUrl("https://example.com/path").hostname, "example.com");
});

test("public web research is read-only and does not require a channel", async () => {
  const transport = new FakeTransport();
  const gateway = new IntegrationGateway(transport, new AuthorizedChannelRegistry());

  const response = await gateway.execute({
    actionId: "research-1",
    capability: "research.public_web",
    url: "https://example.com/market",
    method: "GET",
  });
  assert.equal(response.status, 200);
  assert.equal(transport.calls.length, 1);

  await assert.rejects(() => gateway.execute({
    actionId: "research-2",
    capability: "research.public_web",
    url: "https://example.com/market",
    method: "POST",
  }));
});

test("publishing and commerce writes require an enabled authorized channel and matching origin", async () => {
  const channels = new AuthorizedChannelRegistry();
  channels.register({
    channelId: "store",
    displayName: "Authorized Store",
    origins: ["https://store.example.com"],
    capabilities: ["content.publish_authorized", "commerce.create_offer", "customer.respond_authorized"],
    enabled: true,
  });
  const transport = new FakeTransport();
  const gateway = new IntegrationGateway(transport, channels);

  await gateway.execute({
    actionId: "offer-1",
    capability: "commerce.create_offer",
    channelId: "store",
    url: "https://store.example.com/api/offers",
    method: "POST",
    body: "{}",
  });
  assert.equal(transport.calls.length, 1);

  await assert.rejects(() => gateway.execute({
    actionId: "offer-2",
    capability: "commerce.create_offer",
    channelId: "store",
    url: "https://evil.example/api/offers",
    method: "POST",
    body: "{}",
  }));

  await assert.rejects(() => gateway.execute({
    actionId: "publish-1",
    capability: "content.publish_authorized",
    url: "https://store.example.com/api/posts",
    method: "POST",
    body: "{}",
  }));
});

test("gateway refuses financial and identity capabilities entirely", async () => {
  const gateway = new IntegrationGateway(new FakeTransport(), new AuthorizedChannelRegistry());

  await assert.rejects(() => gateway.execute({
    actionId: "transfer",
    capability: "finance.transfer_funds",
    url: "https://bank.example/api/transfers",
    method: "POST",
    body: "{}",
  }));
  await assert.rejects(() => gateway.execute({
    actionId: "kyc",
    capability: "identity.submit_kyc",
    url: "https://platform.example/api/kyc",
    method: "POST",
    body: "{}",
  }));
});

test("gateway enforces rate and payload budgets", async () => {
  let now = 1_000;
  const gateway = new IntegrationGateway(new FakeTransport(), new AuthorizedChannelRegistry(), {
    maxRequestsPerWindow: 1,
    windowMs: 1_000,
    maxRequestBodyBytes: 3,
    clock: () => now,
  });

  await gateway.execute({
    actionId: "r1",
    capability: "research.public_web",
    url: "https://example.com/a",
    method: "GET",
  }, 999_999);

  now = 1_500;
  await assert.rejects(() => gateway.execute({
    actionId: "r2",
    capability: "research.public_web",
    url: "https://example.com/b",
    method: "GET",
  }, 2_001));

  now = 2_001;
  await gateway.execute({
    actionId: "r3",
    capability: "research.public_web",
    url: "https://example.com/c",
    method: "GET",
  }, -999_999);
});
