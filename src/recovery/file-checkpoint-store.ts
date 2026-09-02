import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DeterministicSandbox, type RecoveryCheckpoint } from "./sandbox.js";

export interface CheckpointStore { save(checkpoint: RecoveryCheckpoint): Promise<void>; load(): Promise<RecoveryCheckpoint | null>; }
const MAX_CHECKPOINT_RECEIPTS = 100_000;

function assertCheckpointShape(value: unknown): asserts value is RecoveryCheckpoint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Recovery checkpoint must be a plain object.");
  const record = value as Record<string, unknown>;
  if (typeof record.runId !== "string") throw new Error("Recovery checkpoint runId must be a string.");
  if (typeof record.createdAt !== "string") throw new Error("Recovery checkpoint createdAt must be a string.");
  if (typeof record.chainHash !== "string") throw new Error("Recovery checkpoint chainHash must be a string.");
  if (!Array.isArray(record.receipts)) throw new Error("Recovery checkpoint receipts must be an array.");
  if (record.receipts.length > MAX_CHECKPOINT_RECEIPTS) throw new Error(`Recovery checkpoint exceeds the maximum of ${MAX_CHECKPOINT_RECEIPTS} receipts.`);
  for (const receipt of record.receipts) {
    if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("Recovery checkpoint receipt must be an object.");
  }
}

function validateCheckpoint(checkpoint: unknown): RecoveryCheckpoint {
  assertCheckpointShape(checkpoint);
  const sandbox = new DeterministicSandbox(); sandbox.restore(checkpoint);
  return { ...checkpoint, receipts: checkpoint.receipts.map((receipt) => ({ ...receipt })) };
}

export class FileCheckpointStore implements CheckpointStore {
  readonly #path: string; #writeQueue: Promise<void> = Promise.resolve();
  constructor(path: string) { if (path.trim().length === 0 || path.includes("\0")) throw new Error("Checkpoint path is invalid."); this.#path = path; }
  async #writeValidated(checkpoint: RecoveryCheckpoint): Promise<void> {
    const directory = dirname(this.#path); await mkdir(directory, { recursive: true, mode: 0o700 }); const tempPath = `${this.#path}.${process.pid}.${randomUUID()}.tmp`; let created = false;
    try { await writeFile(tempPath, `${JSON.stringify(checkpoint)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }); created = true; await rename(tempPath, this.#path); created = false; }
    finally { if (created) await unlink(tempPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
  }
  save(checkpoint: RecoveryCheckpoint): Promise<void> { const validated = validateCheckpoint(checkpoint); const operation = this.#writeQueue.then(() => this.#writeValidated(validated)); this.#writeQueue = operation.catch(() => undefined); return operation; }
  async load(): Promise<RecoveryCheckpoint | null> {
    await this.#writeQueue; let raw: string;
    try { raw = await readFile(this.#path, "utf8"); } catch (error) { const fsError = error as NodeJS.ErrnoException; if (fsError.code === "ENOENT") return null; throw error; }
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error("Persisted recovery checkpoint contains invalid JSON."); }
    return validateCheckpoint(parsed);
  }
}
