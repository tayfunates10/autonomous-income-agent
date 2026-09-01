import type { Capability } from "../policy/capabilities.js";

export type IntegrationKind = "public_web" | "publisher" | "commerce" | "customer_support";

export interface IntegrationAuthorization {
  integrationId: string;
  kind: IntegrationKind;
  allowedHosts: readonly string[];
  allowedCapabilities: readonly Capability[];
  expiresAt?: string;
}

export interface IntegrationRequest<T = unknown> {
  requestId: string;
  integrationId: string;
  capability: Capability;
  host: string;
  payload: T;
}

export interface IntegrationResult<T = unknown> {
  requestId: string;
  integrationId: string;
  ok: boolean;
  data?: T;
  error?: string;
}

export interface IntegrationAdapter<TRequest = unknown, TResult = unknown> {
  readonly integrationId: string;
  readonly kind: IntegrationKind;
  execute(request: IntegrationRequest<TRequest>): Promise<IntegrationResult<TResult>>;
}
