import assert from "node:assert/strict";
import test from "node:test";
import type { IntegrationAdapter, IntegrationRequest, IntegrationResult } from "../src/integrations/contracts.js";
import { SafeIntegrationGateway } from "../src/integrations/gateway.js";

class RecordingAdapter implements IntegrationAdapter<unknown, { accepted: true }> {
  readonly kind = "publisher" as const;
  readonly calls: IntegrationRequest<unknown>[] = [];

  constructor(readonly integrationId: string) {}

  async execute(request: IntegrationRequest<unknown>): Promise<IntegrationResult<{ accepted: true }>> {
    this.calls.push(request);
    return {
      requestId: request.requestId,
      integrationId: request.integrationId,
      ok: true,
      data: { accepted: true },
    };
  }
}

test("authorized publishing executes only on the allowlisted host and capability", async () => {
  const gateway = new SafeIntegrationGateway();
  const adapter = new RecordingAdapter("publisher-1");
  gateway.register(adapter);
  gateway.authorize({
    integrationId: "publisher-1",
    kind: "publisher",
    allowedHosts: ["example.com"],
    allowedCapabilities: ["content.publish_authorized"],
    expiresAt: "2026-09-02T00:00:00.000Z",
  });

  const result = await gateway.execute(
    {
      requestId: "publish-1",
      integrationId: "publisher-1",
      capability: "content.publish_authorized",
      host: "example.com",
      payload: { title: "Evidence-backed offer" },
    },
    new Date("2026-09-01T12:00:00.000Z"),
  );

  assert.equal(result.ok, true);
  assert.equal(adapter.calls.length, 1);
});

test("gateway blocks host escape and expired authorizations", async () => {
  const gateway = new SafeIntegrationGateway();
  const adapter = new RecordingAdapter("publisher-2");
  gateway.register(adapter);
  gateway.authorize({
    integrationId: "publisher-2",
    kind: "publisher",
    allowedHosts: ["example.com"],
    allowedCapabilities: ["content.publish_authorized"],
    expiresAt: "2026-09-01T11:00:00.000Z",
  });

  const expired = await gateway.execute(
    { requestId: "p2", integrationId: "publisher-2", capability: "content.publish_authorized", host: "example.com", payload: {} },
    new Date("2026-09-01T12:00:00.000Z"),
  );
  assert.equal(expired.error, "integration_authorization_expired");

  gateway.authorize({
    integrationId: "publisher-2",
    kind: "publisher",
    allowedHosts: ["example.com"],
    allowedCapabilities: ["content.publish_authorized"],
  });
  const escaped = await gateway.execute({
    requestId: "p3",
    integrationId: "publisher-2",
    capability: "content.publish_authorized",
    host: "evil.example",
    payload: {},
  });
  assert.equal(escaped.error, "host_not_allowed");
  assert.equal(adapter.calls.length, 0);
});

test("gateway cannot turn owner-gated or permanently denied capabilities into autonomous actions", async () => {
  const gateway = new SafeIntegrationGateway();
  const adapter = new RecordingAdapter("publisher-3");
  gateway.register(adapter);
  gateway.authorize({
    integrationId: "publisher-3",
    kind: "publisher",
    allowedHosts: ["example.com"],
    allowedCapabilities: ["identity.submit_kyc", "identity.impersonate_human"],
  });

  const kyc = await gateway.execute({ requestId: "kyc", integrationId: "publisher-3", capability: "identity.submit_kyc", host: "example.com", payload: {} });
  const impersonation = await gateway.execute({ requestId: "imp", integrationId: "publisher-3", capability: "identity.impersonate_human", host: "example.com", payload: {} });

  assert.equal(kyc.error, "policy_require_owner_approval");
  assert.equal(impersonation.error, "policy_deny");
  assert.equal(adapter.calls.length, 0);
});
