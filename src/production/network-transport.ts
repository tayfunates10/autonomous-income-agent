import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type {
  IntegrationTransport,
  IntegrationTransportRequest,
  IntegrationTransportResponse,
} from "../integrations/gateway.js";
import { validatePublicHttpsUrl } from "../integrations/safe-url.js";
import { validateSecretReference, type SecretReference } from "../security/controls.js";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface AddressResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export class SystemAddressResolver implements AddressResolver {
  async resolve(hostname: string): Promise<readonly ResolvedAddress[]> {
    const answers = await lookup(hostname, { all: true, verbatim: true });
    return answers.map((answer) => ({ address: answer.address, family: answer.family as 4 | 6 }));
  }
}

export interface SecretValueResolver {
  resolve(reference: SecretReference): Promise<string>;
}

export class EnvironmentSecretValueResolver implements SecretValueResolver {
  async resolve(reference: SecretReference): Promise<string> {
    const validated = validateSecretReference(reference);
    if (validated.provider !== "environment") {
      throw new Error(`Secret provider ${validated.provider} requires an external production resolver.`);
    }
    if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(validated.name)) {
      throw new Error("Environment secret reference must be an uppercase environment variable name.");
    }
    const value = process.env[validated.name];
    if (!value) throw new Error(`Required environment secret ${validated.name} is unavailable.`);
    return value;
  }
}

export interface OriginCredentialBinding {
  origin: string;
  header: "authorization" | "x-api-key";
  secret: SecretReference;
  prefix?: string;
}

export interface PinnedHttpsRequest extends IntegrationTransportRequest {
  pinnedAddress: ResolvedAddress;
  credential?: { header: "authorization" | "x-api-key"; value: string };
}

export type PinnedHttpsRequester = (request: PinnedHttpsRequest) => Promise<IntegrationTransportResponse>;

function ipv4IsPublic(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = -1, b = -1, c = -1] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function ipv6IsPublic(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("::ffff:")) return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (/^fe[c-f]/.test(normalized)) return false;
  if (normalized.startsWith("ff")) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  if (normalized.startsWith("2002:")) return false;
  return true;
}

export function isPublicNetworkAddress(address: ResolvedAddress): boolean {
  const family = isIP(address.address);
  if (family !== address.family) return false;
  return family === 4 ? ipv4IsPublic(address.address) : ipv6IsPublic(address.address);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Network timeout must be a positive safe integer.");
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function resolvePinnedPublicAddress(
  hostname: string,
  resolver: AddressResolver,
  timeoutMs = 10_000,
): Promise<ResolvedAddress> {
  const answers = await withTimeout(
    resolver.resolve(hostname),
    timeoutMs,
    "DNS resolution timed out.",
  );
  if (answers.length === 0) throw new Error("DNS resolution returned no addresses.");
  if (answers.some((answer) => !isPublicNetworkAddress(answer))) {
    throw new Error("DNS resolution returned a private, reserved, or otherwise non-public address.");
  }
  return { ...answers[0]! };
}

async function nodePinnedHttpsRequester(request: PinnedHttpsRequest): Promise<IntegrationTransportResponse> {
  const url = validatePublicHttpsUrl(request.url);
  const port = url.port === "" ? 443 : Number(url.port);
  return new Promise<IntegrationTransportResponse>((resolve, reject) => {
    const headers: Record<string, string | number> = {
      host: url.host,
      "accept-encoding": "identity",
    };
    if (request.body !== undefined) headers["content-length"] = Buffer.byteLength(request.body, "utf8");
    if (request.credential) headers[request.credential.header] = request.credential.value;

    const req = httpsRequest({
      hostname: request.pinnedAddress.address,
      family: request.pinnedAddress.family,
      port,
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers,
      ...(isIP(url.hostname) === 0 ? { servername: url.hostname } : {}),
      rejectUnauthorized: true,
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        reject(new Error("HTTP redirects are denied by the production transport."));
        return;
      }

      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(contentLength) && contentLength > request.maxResponseBytes) {
        response.resume();
        reject(new Error("HTTP response Content-Length exceeds configured size limit."));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > request.maxResponseBytes) {
          response.destroy(new Error("HTTP response exceeds configured size limit."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });

    req.setTimeout(request.timeoutMs, () => req.destroy(new Error("Production HTTPS request timed out.")));
    req.on("error", reject);
    if (request.body !== undefined) req.write(request.body, "utf8");
    req.end();
  });
}

export interface ProductionHttpsTransportOptions {
  allowedOrigins: readonly string[];
  resolver?: AddressResolver;
  secretResolver?: SecretValueResolver;
  credentialBindings?: readonly OriginCredentialBinding[];
  allowedPorts?: readonly number[];
  requester?: PinnedHttpsRequester;
}

export class ProductionHttpsTransport implements IntegrationTransport {
  readonly #resolver: AddressResolver;
  readonly #secretResolver: SecretValueResolver;
  readonly #bindings = new Map<string, OriginCredentialBinding>();
  readonly #allowedOrigins: ReadonlySet<string>;
  readonly #allowedPorts: ReadonlySet<number>;
  readonly #requester: PinnedHttpsRequester;

  constructor(options: ProductionHttpsTransportOptions) {
    this.#resolver = options.resolver ?? new SystemAddressResolver();
    this.#secretResolver = options.secretResolver ?? new EnvironmentSecretValueResolver();
    this.#requester = options.requester ?? nodePinnedHttpsRequester;

    if (options.allowedOrigins.length === 0) throw new Error("Production transport requires at least one authorized origin.");
    const origins = options.allowedOrigins.map((origin) => validatePublicHttpsUrl(origin).origin);
    this.#allowedOrigins = new Set(origins);
    if (this.#allowedOrigins.size !== origins.length) throw new Error("Production transport authorized origins must be unique.");

    const ports = options.allowedPorts ?? [443];
    if (ports.length === 0 || ports.some((port) => !Number.isSafeInteger(port) || port < 1 || port > 65535)) {
      throw new Error("Production transport allowed ports are invalid.");
    }
    this.#allowedPorts = new Set(ports);

    for (const binding of options.credentialBindings ?? []) {
      const origin = validatePublicHttpsUrl(binding.origin).origin;
      if (!this.#allowedOrigins.has(origin)) {
        throw new Error(`Credential binding origin ${origin} is not an authorized production origin.`);
      }
      if (this.#bindings.has(origin)) throw new Error(`Duplicate credential binding for ${origin}.`);
      const secret = validateSecretReference(binding.secret);
      this.#bindings.set(origin, {
        origin,
        header: binding.header,
        secret,
        ...(binding.prefix === undefined ? {} : { prefix: binding.prefix }),
      });
    }
  }

  async send(request: IntegrationTransportRequest): Promise<IntegrationTransportResponse> {
    const url = validatePublicHttpsUrl(request.url);
    if (!this.#allowedOrigins.has(url.origin)) {
      throw new Error(`HTTPS origin ${url.origin} is not authorized by production policy.`);
    }
    const port = url.port === "" ? 443 : Number(url.port);
    if (!this.#allowedPorts.has(port)) throw new Error(`HTTPS port ${port} is not allowed by production policy.`);

    const pinnedAddress = await resolvePinnedPublicAddress(url.hostname, this.#resolver, request.timeoutMs);
    const binding = this.#bindings.get(url.origin);
    let credential: PinnedHttpsRequest["credential"];
    if (binding) {
      const secret = await this.#secretResolver.resolve(binding.secret);
      if (secret.length === 0 || /[\r\n]/.test(secret)) throw new Error("Resolved credential is invalid for an HTTP header.");
      const value = `${binding.prefix ?? ""}${secret}`;
      credential = { header: binding.header, value };
    }

    const response = await this.#requester({
      ...request,
      pinnedAddress,
      ...(credential === undefined ? {} : { credential }),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("HTTP redirects are denied by the production transport.");
    }
    return response;
  }
}
