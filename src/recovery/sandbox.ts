import { createHash } from "node:crypto";

export type SandboxEffect = "network" | "filesystem" | "process" | "none";

export interface SandboxStep {
  stepId: string;
  effect: SandboxEffect;
  input: unknown;
}

export interface SandboxReceipt {
  stepId: string;
  effect: SandboxEffect;
  inputHash: string;
  outputHash: string;
  status: "completed";
}

export interface RecoveryCheckpoint {
  runId: string;
  createdAt: string;
  receipts: readonly SandboxReceipt[];
  chainHash: string;
}

function stable(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Sandbox values must contain only finite numbers.");
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Sandbox Date values must be valid.");
    return `{"$date":${JSON.stringify(value.toISOString())}}`;
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Unsupported sandbox object type; only plain objects, arrays and Date are allowed.");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  throw new Error(`Unsupported sandbox value type: ${typeof value}.`);
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export class DeterministicSandbox {
  readonly #receipts: SandboxReceipt[] = [];
  readonly #completed = new Map<string, SandboxReceipt>();

  execute(step: SandboxStep, executor: (input: unknown) => unknown): SandboxReceipt {
    if (step.stepId.trim().length === 0) throw new Error("stepId cannot be empty.");
    const inputHash = digest(step.input);
    const completed = this.#completed.get(step.stepId);
    if (completed) {
      if (completed.effect !== step.effect || completed.inputHash !== inputHash) {
        throw new Error(`Idempotency conflict for completed step ${step.stepId}.`);
      }
      return { ...completed };
    }

    const output = executor(structuredClone(step.input));
    const receipt: SandboxReceipt = {
      stepId: step.stepId,
      effect: step.effect,
      inputHash,
      outputHash: digest(output),
      status: "completed",
    };
    this.#receipts.push(receipt);
    this.#completed.set(step.stepId, receipt);
    return { ...receipt };
  }

  checkpoint(runId: string, createdAt = new Date().toISOString()): RecoveryCheckpoint {
    if (runId.trim().length === 0) throw new Error("runId cannot be empty.");
    if (!Number.isFinite(Date.parse(createdAt))) throw new Error("Checkpoint createdAt must be a valid timestamp.");
    const receipts = this.#receipts.map((receipt) => ({ ...receipt }));
    return {
      runId,
      createdAt,
      receipts,
      chainHash: digest({ runId, createdAt, receipts }),
    };
  }

  restore(checkpoint: RecoveryCheckpoint): void {
    if (checkpoint.runId.trim().length === 0) throw new Error("Recovery checkpoint runId cannot be empty.");
    if (!Number.isFinite(Date.parse(checkpoint.createdAt))) throw new Error("Recovery checkpoint timestamp is invalid.");
    const expected = digest({ runId: checkpoint.runId, createdAt: checkpoint.createdAt, receipts: checkpoint.receipts });
    if (expected !== checkpoint.chainHash) throw new Error("Recovery checkpoint integrity verification failed.");

    const seen = new Set<string>();
    for (const receipt of checkpoint.receipts) {
      if (receipt.stepId.trim().length === 0) throw new Error("Recovery checkpoint contains an empty stepId.");
      if (seen.has(receipt.stepId)) throw new Error("Recovery checkpoint contains duplicate step IDs.");
      if (!/^[a-f0-9]{64}$/.test(receipt.inputHash) || !/^[a-f0-9]{64}$/.test(receipt.outputHash)) {
        throw new Error("Recovery checkpoint contains an invalid receipt hash.");
      }
      if (receipt.status !== "completed") throw new Error("Recovery checkpoint contains an unsupported receipt status.");
      seen.add(receipt.stepId);
    }

    this.#receipts.length = 0;
    this.#completed.clear();
    for (const receipt of checkpoint.receipts) {
      const copy = { ...receipt };
      this.#receipts.push(copy);
      this.#completed.set(receipt.stepId, copy);
    }
  }

  receipts(): readonly SandboxReceipt[] {
    return this.#receipts.map((receipt) => ({ ...receipt }));
  }
}
