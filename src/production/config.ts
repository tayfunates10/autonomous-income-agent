import { validatePublicHttpsUrl } from "../integrations/safe-url.js";
import { validateSecretReference } from "../security/controls.js";
import type { OriginCredentialBinding } from "./network-transport.js";

export interface ProductionConfig {
  mode: "production";
  agentId: string;
  displayName: string;
  ownerReference: string;
  disclosure: string;
  ownerKeyId: string;
  ownerPublicKeyPem: string;
  budgetLimitMinor: number;
  budgetCurrency: string;
  allowedOrigins: readonly string[];
  credentialBindings: readonly OriginCredentialBinding[];
  checkpointPath: string;
  network: {
    timeoutMs: number;
    maxResponseBytes: number;
    maxRequestBodyBytes: number;
    maxRequestsPerWindow: number;
    windowMs: number;
  };
}

export type EnvironmentMap = Readonly<Record<string, string | undefined>>;

function required(env: EnvironmentMap, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Required production setting ${name} is missing.`);
  return value;
}

function positiveInteger(env: EnvironmentMap, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer.`);
  return value;
}

function nonNegativeInteger(env: EnvironmentMap, name: string): number {
  const value = Number(required(env, name));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer.`);
  return value;
}

function parseOrigins(raw: string): readonly string[] {
  const origins = raw.split(",").map((value) => value.trim()).filter(Boolean).map((value) => validatePublicHttpsUrl(value).origin);
  const unique = [...new Set(origins)];
  if (unique.length === 0) throw new Error("At least one authorized production origin is required.");
  return unique;
}

function parseCredentialBindings(raw: string | undefined, allowedOrigins: readonly string[]): readonly OriginCredentialBinding[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AIA_CREDENTIAL_BINDINGS_JSON must contain valid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("AIA_CREDENTIAL_BINDINGS_JSON must be a JSON array.");

  return parsed.map((value, index) => {
    if (value === null || typeof value !== "object") throw new Error(`Credential binding ${index} must be an object.`);
    const record = value as Record<string, unknown>;
    const originRaw = typeof record.origin === "string" ? record.origin : "";
    const origin = validatePublicHttpsUrl(originRaw).origin;
    if (!allowedOrigins.includes(origin)) throw new Error(`Credential binding origin ${origin} is not in AIA_ALLOWED_ORIGINS.`);
    const header = record.header;
    if (header !== "authorization" && header !== "x-api-key") throw new Error(`Credential binding ${index} has an unsupported header.`);
    const secretRaw = record.secret;
    if (secretRaw === null || typeof secretRaw !== "object") throw new Error(`Credential binding ${index} requires a secret reference.`);
    const secretRecord = secretRaw as Record<string, unknown>;
    const provider = secretRecord.provider;
    const name = secretRecord.name;
    if (provider !== "environment" && provider !== "vault" && provider !== "cloud_secret_manager") {
      throw new Error(`Credential binding ${index} has an unsupported secret provider.`);
    }
    if (typeof name !== "string") throw new Error(`Credential binding ${index} secret name must be a string.`);
    const secret = validateSecretReference({ provider, name });
    const prefix = record.prefix;
    if (prefix !== undefined && typeof prefix !== "string") throw new Error(`Credential binding ${index} prefix must be a string.`);
    if (typeof prefix === "string" && /[\r\n]/.test(prefix)) throw new Error(`Credential binding ${index} prefix contains invalid header characters.`);
    return {
      origin,
      header,
      secret,
      ...(prefix === undefined ? {} : { prefix }),
    };
  });
}

export function loadProductionConfig(env: EnvironmentMap = process.env): ProductionConfig {
  if (env.AIA_OWNER_PRIVATE_KEY_PEM?.trim()) {
    throw new Error("The owner's private approval signing key must never be present in the agent runtime environment.");
  }

  const budgetCurrency = required(env, "AIA_BUDGET_CURRENCY").toUpperCase();
  if (!/^[A-Z]{3}$/.test(budgetCurrency)) throw new Error("AIA_BUDGET_CURRENCY must be a three-letter currency code.");
  const allowedOrigins = parseOrigins(required(env, "AIA_ALLOWED_ORIGINS"));
  const checkpointPath = required(env, "AIA_CHECKPOINT_PATH");
  if (checkpointPath.includes("\0")) throw new Error("AIA_CHECKPOINT_PATH contains an invalid null byte.");

  return {
    mode: "production",
    agentId: required(env, "AIA_AGENT_ID"),
    displayName: required(env, "AIA_AGENT_DISPLAY_NAME"),
    ownerReference: required(env, "AIA_OWNER_REFERENCE"),
    disclosure: required(env, "AIA_AGENT_DISCLOSURE"),
    ownerKeyId: required(env, "AIA_OWNER_KEY_ID"),
    ownerPublicKeyPem: required(env, "AIA_OWNER_PUBLIC_KEY_PEM"),
    budgetLimitMinor: nonNegativeInteger(env, "AIA_BUDGET_LIMIT_MINOR"),
    budgetCurrency,
    allowedOrigins,
    credentialBindings: parseCredentialBindings(env.AIA_CREDENTIAL_BINDINGS_JSON, allowedOrigins),
    checkpointPath,
    network: {
      timeoutMs: positiveInteger(env, "AIA_NETWORK_TIMEOUT_MS", 10_000),
      maxResponseBytes: positiveInteger(env, "AIA_MAX_RESPONSE_BYTES", 1_000_000),
      maxRequestBodyBytes: positiveInteger(env, "AIA_MAX_REQUEST_BODY_BYTES", 256_000),
      maxRequestsPerWindow: positiveInteger(env, "AIA_MAX_REQUESTS_PER_WINDOW", 60),
      windowMs: positiveInteger(env, "AIA_RATE_WINDOW_MS", 60_000),
    },
  };
}
