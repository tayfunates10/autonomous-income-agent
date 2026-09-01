import type { Capability } from "../policy/capabilities.js";
import { evaluatePolicy } from "../policy/engine.js";
import { AuthorizedChannelRegistry } from "./channels.js";
import { validatePublicHttpsUrl } from "./safe-url.js";

export type IntegrationMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH";

export interface IntegrationTransportRequest {
  url: string;
  method: IntegrationMethod;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface IntegrationTransportResponse {
  status: number;
  body: string;
  headers?: Readonly<Record<string, string>>;
}

export interface IntegrationTransport {
  send(request: IntegrationTransportRequest): Promise<IntegrationTransportResponse>;
}

export interface IntegrationRequest {
  actionId: string;
  capability: Capability;
  url: string;
  method: IntegrationMethod;
  channelId?: string;
  body?: string;
}

export interface IntegrationGatewayOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRequestBodyBytes?: number;
  maxRequestsPerWindow?: number;
  windowMs?: number;
}

const READ_METHODS = new Set<IntegrationMethod>(["GET", "HEAD"]);
const WRITE_CAPABILITIES = new Set<Capability>([
  "content.publish_authorized",
  "customer.respond_authorized",
  "commerce.create_offer",
]);

export class IntegrationGateway {
  readonly #transport: IntegrationTransport;
  readonly #channels: AuthorizedChannelRegistry;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #maxRequestBodyBytes: number;
  readonly #maxRequestsPerWindow: number;
  readonly #windowMs: number;
  readonly #requestTimestamps: number[] = [];

  constructor(
    transport: IntegrationTransport,
    channels: AuthorizedChannelRegistry,
    options: IntegrationGatewayOptions = {},
  ) {
    this.#transport = transport;
    this.#channels = channels;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#maxResponseBytes = options.maxResponseBytes ?? 1_000_000;
    this.#maxRequestBodyBytes = options.maxRequestBodyBytes ?? 256_000;
    this.#maxRequestsPerWindow = options.maxRequestsPerWindow ?? 60;
    this.#windowMs = options.windowMs ?? 60_000;

    if (this.#timeoutMs <= 0 || this.#maxResponseBytes <= 0 || this.#maxRequestBodyBytes <= 0) {
      throw new Error("Integration gateway size and timeout limits must be positive.");
    }
    if (!Number.isSafeInteger(this.#maxRequestsPerWindow) || this.#maxRequestsPerWindow <= 0) {
      throw new Error("maxRequestsPerWindow must be a positive safe integer.");
    }
  }

  async execute(request: IntegrationRequest, now = Date.now()): Promise<IntegrationTransportResponse> {
    if (request.actionId.trim().length === 0) throw new Error("actionId cannot be empty.");
    const target = validatePublicHttpsUrl(request.url);
    this.#enforceRequestShape(request, target);
    this.#consumeRateBudget(now);

    const channelAuthorized = WRITE_CAPABILITIES.has(request.capability)
      ? this.#channels.isAuthorized(request.channelId, request.capability, target)
      : undefined;

    if (WRITE_CAPABILITIES.has(request.capability) && channelAuthorized !== true) {
      throw new Error("Write integration target is not authorized for this capability.");
    }

    const policy = evaluatePolicy({ capability: request.capability, channelAuthorized });
    if (policy.decision !== "allow") {
      throw new Error(`Integration denied by policy: ${policy.reason}`);
    }

    const response = await this.#transport.send({
      url: target.toString(),
      method: request.method,
      ...(request.body === undefined ? {} : { body: request.body }),
      timeoutMs: this.#timeoutMs,
      maxResponseBytes: this.#maxResponseBytes,
    });

    if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599) {
      throw new Error("Integration transport returned an invalid HTTP status.");
    }
    if (Buffer.byteLength(response.body, "utf8") > this.#maxResponseBytes) {
      throw new Error("Integration response exceeds configured size limit.");
    }

    return { ...response, headers: response.headers ? { ...response.headers } : undefined };
  }

  #enforceRequestShape(request: IntegrationRequest, target: URL): void {
    if (request.body !== undefined && Buffer.byteLength(request.body, "utf8") > this.#maxRequestBodyBytes) {
      throw new Error("Integration request body exceeds configured size limit.");
    }

    if (request.capability === "research.public_web") {
      if (!READ_METHODS.has(request.method)) throw new Error("Public-web research is read-only.");
      if (request.body !== undefined) throw new Error("Public-web research requests cannot include a body.");
      return;
    }

    if (WRITE_CAPABILITIES.has(request.capability)) {
      if (READ_METHODS.has(request.method)) throw new Error("Write capabilities require a write HTTP method.");
      return;
    }

    throw new Error(`Capability ${request.capability} is not exposed through the internet integration gateway.`);
  }

  #consumeRateBudget(now: number): void {
    if (!Number.isFinite(now)) throw new Error("Rate-limit timestamp must be finite.");
    while (this.#requestTimestamps.length > 0 && (this.#requestTimestamps[0] ?? now) <= now - this.#windowMs) {
      this.#requestTimestamps.shift();
    }
    if (this.#requestTimestamps.length >= this.#maxRequestsPerWindow) {
      throw new Error("Integration request rate limit exceeded.");
    }
    this.#requestTimestamps.push(now);
  }
}
