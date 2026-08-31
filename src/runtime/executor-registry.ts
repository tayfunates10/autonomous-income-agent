import type { Capability } from "../policy/capabilities.js";

export interface ExecutionContext {
  taskId: string;
  actionId: string;
  attempt: number;
  signal?: AbortSignal;
}

export type CapabilityExecutor = (input: unknown, context: ExecutionContext) => Promise<unknown>;

export class ExecutorRegistry {
  readonly #executors = new Map<Capability, CapabilityExecutor>();

  register(capability: Capability, executor: CapabilityExecutor): void {
    if (this.#executors.has(capability)) {
      throw new Error(`Executor already registered for ${capability}.`);
    }
    this.#executors.set(capability, executor);
  }

  get(capability: Capability): CapabilityExecutor | undefined {
    return this.#executors.get(capability);
  }
}

export class TransientExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientExecutionError";
  }
}
