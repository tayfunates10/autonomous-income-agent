import { createPublicKey } from "node:crypto";
import type { ProductionConfig } from "./config.js";

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ReadinessReport {
  status: "ready" | "not_ready";
  checkedAt: string;
  checks: readonly ReadinessCheck[];
}

function check(name: string, ok: boolean, detail: string): ReadinessCheck {
  return { name, ok, detail };
}

function ownerPublicKeyIsValid(config: ProductionConfig): boolean {
  if (config.ownerKeyId.trim().length === 0 || config.ownerPublicKeyPem.trim().length === 0) return false;
  try {
    const key = createPublicKey(config.ownerPublicKeyPem);
    return key.type === "public" && key.asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

export function evaluateProductionReadiness(config: ProductionConfig, now = new Date()): ReadinessReport {
  const checks: ReadinessCheck[] = [
    check("production_mode", config.mode === "production", "Runtime must be explicitly configured for production."),
    check("agent_identity", config.agentId.trim().length > 0 && config.displayName.trim().length > 0, "Agent identity must be configured."),
    check("owner_reference", config.ownerReference.trim().length > 0, "Owner reference must be configured."),
    check("ai_disclosure", config.disclosure.trim().length >= 12, "AI representative disclosure must be explicit."),
    check("owner_public_key", ownerPublicKeyIsValid(config), "Owner approval verification public key must be a parseable Ed25519 public key; private signing key must remain external."),
    check("budget", Number.isSafeInteger(config.budgetLimitMinor) && config.budgetLimitMinor >= 0 && /^[A-Z]{3}$/.test(config.budgetCurrency), "Budget policy must be valid."),
    check("authorized_origins", config.allowedOrigins.length > 0 && config.allowedOrigins.every((origin) => origin.startsWith("https://")), "At least one HTTPS origin must be authorized."),
    check("checkpoint_store", config.checkpointPath.trim().length > 0, "Persistent checkpoint path must be configured."),
    check("network_limits", config.network.timeoutMs > 0 && config.network.maxResponseBytes > 0 && config.network.maxRequestBodyBytes > 0 && config.network.maxRequestsPerWindow > 0 && config.network.windowMs > 0, "Network resource limits must be positive."),
  ];

  return {
    status: checks.every((item) => item.ok) ? "ready" : "not_ready",
    checkedAt: now.toISOString(),
    checks,
  };
}

export function assertProductionReady(config: ProductionConfig): void {
  const report = evaluateProductionReadiness(config);
  const failed = report.checks.filter((item) => !item.ok);
  if (failed.length > 0) {
    throw new Error(`Production readiness failed: ${failed.map((item) => item.name).join(", ")}.`);
  }
}
