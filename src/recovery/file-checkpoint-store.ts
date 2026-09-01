import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DeterministicSandbox, type RecoveryCheckpoint } from "./sandbox.js";

export interface CheckpointStore {
  save(checkpoint: RecoveryCheckpoint): Promise<void>;
  load(): Promise<RecoveryCheckpoint | null>;
}

function validateCheckpoint(checkpoint: RecoveryCheckpoint): RecoveryCheckpoint {
  const sandbox = new DeterministicSandbox();
  sandbox.restore(checkpoint);
  return {
    ...checkpoint,
    receipts: checkpoint.receipts.map((receipt) => ({ ...receipt })),
  };
}

export class FileCheckpointStore implements CheckpointStore {
  readonly #path: string;

  constructor(path: string) {
    if (path.trim().length === 0 || path.includes("\0")) throw new Error("Checkpoint path is invalid.");
    this.#path = path;
  }

  async save(checkpoint: RecoveryCheckpoint): Promise<void> {
    const validated = validateCheckpoint(checkpoint);
    const directory = dirname(this.#path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const tempPath = `${this.#path}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(validated)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(tempPath, this.#path);
    } finally {
      await unlink(tempPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async load(): Promise<RecoveryCheckpoint | null> {
    let raw: string;
    try {
      raw = await readFile(this.#path, "utf8");
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === "ENOENT") return null;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Persisted recovery checkpoint contains invalid JSON.");
    }
    if (parsed === null || typeof parsed !== "object") throw new Error("Persisted recovery checkpoint must be an object.");
    return validateCheckpoint(parsed as RecoveryCheckpoint);
  }
}
