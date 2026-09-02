import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCheckpointStore } from "../src/recovery/file-checkpoint-store.js";
import { DeterministicSandbox, type RecoveryCheckpoint } from "../src/recovery/sandbox.js";

async function checkpoint(runId: string, value: number): Promise<RecoveryCheckpoint> {
  const sandbox = new DeterministicSandbox();
  await sandbox.execute(
    { stepId: `${runId}-step`, effect: "filesystem", input: { value } },
    async (input) => ({ persisted: input }),
  );
  return sandbox.checkpoint(runId, `2026-09-02T08:${String(value).padStart(2, "0")}:00.000Z`);
}

test("concurrent saves are serialized and never delete another write's temp file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aia-checkpoint-"));
  try {
    const path = join(directory, "checkpoint.json");
    const store = new FileCheckpointStore(path);
    const checkpoints = await Promise.all(
      Array.from({ length: 20 }, (_, index) => checkpoint(`run-${index}`, index)),
    );

    await Promise.all(checkpoints.map((item) => store.save(item)));

    const loaded = await store.load();
    assert.equal(loaded?.runId, "run-19");
    const leftovers = (await readdir(directory)).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(leftovers, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
