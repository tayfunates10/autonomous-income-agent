import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductionHttpsTransport,
  resolvePinnedPublicAddress,
  type AddressResolver,
  type PinnedHttpsRequest,
  type SecretValueResolver,
} from "../src/production/network-transport.js";

const publicResolver: AddressResolver = {
  async resolve() {
    return [{ address: "93.184.216.34", family: 4 }];
  },
};

test("DNS pinning rejects any private or reserved answer", async () => {
  const mixedResolver: AddressResolver = {
    async resolve() {
      return [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ];
    },
  };
  await assert.rejects(() => resolvePinnedPublicAddress("example.com", mixedResolver), /private, reserved/);
});

test("production transport rejects redirects even from requester abstraction", async () => {
  const transport = new ProductionHttpsTransport({
    resolver: publicResolver,
    requester: async () => ({ status: 302, body: "redirect" }),
  });
  await assert.rejects(() => transport.send({
    method: "GET",
    url: "https://example.com/path",
    timeoutMs: 1000,
    maxResponseBytes: 1024,
  }), /redirects are denied/);
});

test("credentials bind only to exact configured origin", async () => {
  const captured: PinnedHttpsRequest[] = [];
  const secretResolver: SecretValueResolver = { async resolve() { return "token-value"; } };
  const transport = new ProductionHttpsTransport({
    resolver: publicResolver,
    secretResolver,
    credentialBindings: [{
      origin: "https://api.example.com",
      header: "authorization",
      prefix: "Bearer ",
      secret: { provider: "environment", name: "AIA_PROVIDER_TOKEN" },
    }],
    requester: async (request) => {
      captured.push(request);
      return { status: 200, body: "ok" };
    },
  });

  await transport.send({ method: "GET", url: "https://api.example.com/v1", timeoutMs: 1000, maxResponseBytes: 1024 });
  assert.equal(captured[0]?.credential?.value, "Bearer token-value");

  await transport.send({ method: "GET", url: "https://example.com/v1", timeoutMs: 1000, maxResponseBytes: 1024 });
  assert.equal(captured[1]?.credential, undefined);
});
