import { evaluatePolicy } from "../policy/engine.js";
import type { IntegrationAdapter, IntegrationAuthorization, IntegrationRequest, IntegrationResult } from "./contracts.js";

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function isHostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const normalized = normalizeHost(host);
  return allowedHosts.some((allowed) => normalizeHost(allowed) === normalized);
}

function isAuthorizationExpired(authorization: IntegrationAuthorization, now: Date): boolean {
  if (!authorization.expiresAt) return false;
  const expiresAt = Date.parse(authorization.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= now.getTime();
}

export class SafeIntegrationGateway {
  readonly #authorizations = new Map<string, IntegrationAuthorization>();
  readonly #adapters = new Map<string, IntegrationAdapter<unknown, unknown>>();

  authorize(authorization: IntegrationAuthorization): void {
    if (authorization.integrationId.trim().length === 0) throw new Error("integrationId cannot be empty.");
    if (authorization.allowedHosts.length === 0) throw new Error("At least one allowed host is required.");
    if (authorization.allowedCapabilities.length === 0) throw new Error("At least one allowed capability is required.");
    this.#authorizations.set(authorization.integrationId, {
      ...authorization,
      allowedHosts: [...authorization.allowedHosts],
      allowedCapabilities: [...authorization.allowedCapabilities],
    });
  }

  register(adapter: IntegrationAdapter<unknown, unknown>): void {
    if (adapter.integrationId.trim().length === 0) throw new Error("Adapter integrationId cannot be empty.");
    if (this.#adapters.has(adapter.integrationId)) throw new Error(`Adapter ${adapter.integrationId} already registered.`);
    this.#adapters.set(adapter.integrationId, adapter);
  }

  async execute<TRequest, TResult>(request: IntegrationRequest<TRequest>, now = new Date()): Promise<IntegrationResult<TResult>> {
    const authorization = this.#authorizations.get(request.integrationId);
    if (!authorization) return { requestId: request.requestId, integrationId: request.integrationId, ok: false, error: "integration_not_authorized" };
    if (isAuthorizationExpired(authorization, now)) return { requestId: request.requestId, integrationId: request.integrationId, ok: false, error: "integration_authorization_expired" };
    if (!isHostAllowed(request.host, authorization.allowedHosts)) return { requestId: request.requestId, integrationId: request.integrationId, ok: false, error: "host_not_allowed" };
    if (!authorization.allowedCapabilities.includes(request.capability)) return { requestId: request.requestId, integrationId: request.integrationId, ok: false, error: "capability_not_authorized_for_integration" };

    const policy = evaluatePolicy({
      capability: request.capability,
      channelAuthorized: authorization.kind === "publisher" || authorization.kind === "customer_support",
    });
    if (policy.decision !== "allow") {
      return { requestId: request.requestId, integrationId: request.integrationId, ok: false, error: `policy_${policy.decision}` };
    }

    const adapter = this.#adapters.get(request.integrationId);
    if (!adapter) return { requestId: request.requestId, integrationId: request.integrationId, ok: false, error: "adapter_not_registered" };
    if (adapter.kind !== authorization.kind) return { requestId: request.requestId, integrationId: request.integrationId, ok: false, error: "adapter_kind_mismatch" };

    const result = await adapter.execute(request as IntegrationRequest<unknown>);
    return result as IntegrationResult<TResult>;
  }
}
