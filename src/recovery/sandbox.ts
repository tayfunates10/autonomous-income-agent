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
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export class DeterministicSandbox {
  readonly #receipts: SandboxReceipt[] = [];
  readonly #completed = new Map<string, SandboxReceipt>();

  execute(step: SandboxStep, executor: (input: unknown) => unknown): SandboxReceipt {
    if (step.stepId.trim().length === 0) throw new Error("stepId cannot be empty.");
    if (this.#completed.has(step.stepId)) return this.#completed.get(step.stepId)!;

    const inputHash = digest(step.input);
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
    return receipt;
  }

  checkpoint(runId: string, createdAt = new Date().toISOString()): RecoveryCheckpoint {
    if (runId.trim().length === 0) throw new Error("runId cannot be empty.");
    const receipts = this.#receipts.map((receipt) => ({ ...receipt }));
    return {
      runId,
      createdAt,
      receipts,
      chainHash: digest({ runId, receipts }),
    };
  }

  restore(checkpoint: RecoveryCheckpoint): void {
    const expected = digest({ runId: checkpoint.runId, receipts: checkpoint.receipts });
    if (expected !== checkpoint.chainHash) throw new Error("Recovery checkpoint integrity verification failed.");
    this.#receipts.length = 0;
    this.#completed.clear();
    for (const receipt of checkpoint.receipts) {
      this.#receipts.push({ ...receipt });
      this.#completed.set(receipt.stepId, { ...receipt });
    }
  }

  receipts(): readonly SandboxReceipt[] {
    return this.#receipts.map((receipt) => ({ ...receipt }));
  }
}
