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

test("DNS pinning rejects deprecated IPv6 site-local addresses", async () => {
  const siteLocalResolver: AddressResolver = {
    async resolve() {
      return [{ address: "fec0::1", family: 6 }];
    },
  };
  await assert.rejects(() => resolvePinnedPublicAddress("internal.example", siteLocalResolver), /private, reserved/);
});

test("DNS resolution is bounded by the configured timeout", async () => {
  const stalledResolver: AddressResolver = {
    async resolve() {
      return new Promise<readonly { address: string; family: 4 | 6 }[]>(() => undefined);
    },
  };
  await assert.rejects(() => resolvePinnedPublicAddress("example.com", stalledResolver, 20), /DNS resolution timed out/);
});

test("production transport rejects redirects even from requester abstraction", async () => {
  const transport = new ProductionHttpsTransport({
    allowedOrigins: ["https://example.com"],
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

test("production transport enforces the authorized exact-origin allowlist", async () => {
  let calls = 0;
  const transport = new ProductionHttpsTransport({
    allowedOrigins: ["https://api.example.com"],
    resolver: publicResolver,
    requester: async () => {
      calls += 1;
      return { status: 200, body: "ok" };
    },
  });

  await assert.rejects(() => transport.send({
    method: "GET",
    url: "https://example.com/v1",
    timeoutMs: 1000,
    maxResponseBytes: 1024,
  }), /not authorized/);
  assert.equal(calls, 0);
});

test("credentials bind only to exact configured origin", async () => {
  const captured: PinnedHttpsRequest[] = [];
  const secretResolver: SecretValueResolver = { async resolve() { return "token-value"; } };
  const transport = new ProductionHttpsTransport({
    allowedOrigins: ["https://api.example.com", "https://example.com"],
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

test("credential binding cannot target an origin outside the egress allowlist", () => {
  assert.throws(() => new ProductionHttpsTransport({
    allowedOrigins: ["https://api.example.com"],
    credentialBindings: [{
      origin: "https://evil.example.net",
      header: "authorization",
      secret: { provider: "environment", name: "AIA_PROVIDER_TOKEN" },
    }],
  }), /not an authorized production origin/);
});
