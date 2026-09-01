import type {
  IntegrationTransport,
  IntegrationTransportRequest,
  IntegrationTransportResponse,
} from "../integrations/gateway.js";
import { TransientExecutionError } from "../runtime/executor-registry.js";

export type SandboxOutcome =
  | { kind: "response"; response: IntegrationTransportResponse }
  | { kind: "transient_error"; message: string }
  | { kind: "error"; message: string };

function routeKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${new URL(url).toString()}`;
}

export class SandboxTransport implements IntegrationTransport {
  readonly #routes = new Map<string, SandboxOutcome[]>();
  readonly calls: IntegrationTransportRequest[] = [];

  route(method: IntegrationTransportRequest["method"], url: string, outcomes: readonly SandboxOutcome[]): void {
    if (outcomes.length === 0) throw new Error("Sandbox route requires at least one outcome.");
    this.#routes.set(routeKey(method, url), outcomes.map((outcome) => ({ ...outcome })));
  }

  async send(request: IntegrationTransportRequest): Promise<IntegrationTransportResponse> {
    this.calls.push({ ...request });
    const key = routeKey(request.method, request.url);
    const outcomes = this.#routes.get(key);
    if (!outcomes || outcomes.length === 0) throw new Error(`No sandbox route configured for ${key}.`);
    const outcome = outcomes.length === 1 ? outcomes[0] : outcomes.shift();
    if (!outcome) throw new Error(`Sandbox route ${key} has no outcome.`);

    if (outcome.kind === "transient_error") throw new TransientExecutionError(outcome.message);
    if (outcome.kind === "error") throw new Error(outcome.message);
    return {
      status: outcome.response.status,
      body: outcome.response.body,
      ...(outcome.response.headers === undefined ? {} : { headers: { ...outcome.response.headers } }),
    };
  }
}
