import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { loadProductionConfig } from "../src/production/config.js";
import { evaluateProductionReadiness } from "../src/production/readiness.js";

const { publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();

function env(): Record<string, string> {
  return {
    AIA_AGENT_ID: "agent-prod-1",
    AIA_AGENT_DISPLAY_NAME: "Authorized AI Representative",
    AIA_OWNER_REFERENCE: "owner:primary",
    AIA_AGENT_DISCLOSURE: "AI representative acting under owner authorization.",
    AIA_OWNER_KEY_ID: "owner-key-1",
    AIA_OWNER_PUBLIC_KEY_PEM: PUBLIC_KEY,
    AIA_BUDGET_LIMIT_MINOR: "100000",
    AIA_BUDGET_CURRENCY: "TRY",
    AIA_ALLOWED_ORIGINS: "https://api.example.com",
    AIA_CHECKPOINT_PATH: "/var/lib/aia/checkpoint.json",
  };
}

test("production config becomes ready with explicit safe settings", () => {
  const config = loadProductionConfig(env());
  const report = evaluateProductionReadiness(config, new Date("2026-09-01T09:00:00.000Z"));
  assert.equal(report.status, "ready");
  assert.ok(report.checks.every((item) => item.ok));
});

test("malformed owner public key fails readiness", () => {
  const config = loadProductionConfig({
    ...env(),
    AIA_OWNER_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\nZmFrZQ==\n-----END PUBLIC KEY-----",
  });
  const report = evaluateProductionReadiness(config, new Date("2026-09-01T09:00:00.000Z"));
  assert.equal(report.status, "not_ready");
  assert.equal(report.checks.find((item) => item.name === "owner_public_key")?.ok, false);
});

test("non-Ed25519 owner public key fails readiness", () => {
  const { publicKey: rsaPublicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const config = loadProductionConfig({
    ...env(),
    AIA_OWNER_PUBLIC_KEY_PEM: rsaPublicKey.export({ type: "spki", format: "pem" }).toString(),
  });
  const report = evaluateProductionReadiness(config, new Date("2026-09-01T09:00:00.000Z"));
  assert.equal(report.status, "not_ready");
  assert.equal(report.checks.find((item) => item.name === "owner_public_key")?.ok, false);
});

test("owner private approval key is rejected from agent environment", () => {
  assert.throws(() => loadProductionConfig({ ...env(), AIA_OWNER_PRIVATE_KEY_PEM: "secret" }), /must never be present/);
});

test("non-https authorized origins fail closed", () => {
  assert.throws(() => loadProductionConfig({ ...env(), AIA_ALLOWED_ORIGINS: "http://example.com" }));
});

test("credential bindings must use authorized exact origins and secret references", () => {
  const configured = loadProductionConfig({
    ...env(),
    AIA_CREDENTIAL_BINDINGS_JSON: JSON.stringify([
      {
        origin: "https://api.example.com",
        header: "authorization",
        prefix: "Bearer ",
        secret: { provider: "environment", name: "AIA_PROVIDER_TOKEN" },
      },
    ]),
  });
  assert.equal(configured.credentialBindings.length, 1);

  assert.throws(() => loadProductionConfig({
    ...env(),
    AIA_CREDENTIAL_BINDINGS_JSON: JSON.stringify([
      {
        origin: "https://evil.example.net",
        header: "authorization",
        secret: { provider: "environment", name: "AIA_PROVIDER_TOKEN" },
      },
    ]),
  }), /not in AIA_ALLOWED_ORIGINS/);
});
