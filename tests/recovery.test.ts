import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicSandbox } from "../src/recovery/sandbox.js";

test("sandbox prevents duplicate execution after recovery for identical input", () => {
  const sandbox = new DeterministicSandbox();
  let executions = 0;
  const step = { stepId: "publish-1", effect: "network" as const, input: { draft: "hello" } };
  const receipt = sandbox.execute(step, (input) => {
    executions += 1;
    return { ok: true, input };
  });
  const checkpoint = sandbox.checkpoint("run-1", "2026-09-01T08:30:00.000Z");

  const recovered = new DeterministicSandbox();
  recovered.restore(checkpoint);
  const replayed = recovered.execute(step, () => {
    executions += 1;
    return { ok: false };
  });

  assert.equal(executions, 1);
  assert.deepEqual(replayed, receipt);
  assert.equal(recovered.receipts().length, 1);
});

test("sandbox rejects reused stepId when input or effect changes", () => {
  const sandbox = new DeterministicSandbox();
  sandbox.execute({ stepId: "publish-1", effect: "network", input: { draft: "hello" } }, (input) => input);
  const checkpoint = sandbox.checkpoint("run-conflict", "2026-09-01T08:30:00.000Z");
  const recovered = new DeterministicSandbox();
  recovered.restore(checkpoint);

  assert.throws(() => recovered.execute(
    { stepId: "publish-1", effect: "network", input: { draft: "changed" } },
    () => ({ ok: false }),
  ), /idempotency conflict/i);
  assert.throws(() => recovered.execute(
    { stepId: "publish-1", effect: "filesystem", input: { draft: "hello" } },
    () => ({ ok: false }),
  ), /idempotency conflict/i);
});

test("checkpoint receipt or metadata tampering is rejected", () => {
  const sandbox = new DeterministicSandbox();
  sandbox.execute({ stepId: "s1", effect: "none", input: { value: 1 } }, () => ({ value: 2 }));
  const checkpoint = sandbox.checkpoint("run-2", "2026-09-01T08:31:00.000Z");

  const tamperedReceipt = {
    ...checkpoint,
    receipts: [{ ...checkpoint.receipts[0]!, outputHash: "0".repeat(64) }],
  };
  assert.throws(() => new DeterministicSandbox().restore(tamperedReceipt), /integrity/i);

  const tamperedTimestamp = { ...checkpoint, createdAt: "2026-09-01T08:32:00.000Z" };
  assert.throws(() => new DeterministicSandbox().restore(tamperedTimestamp), /integrity/i);
});

test("recovery checkpoint rejects duplicate receipt step IDs even with a valid recomputation boundary", () => {
  const sandbox = new DeterministicSandbox();
  sandbox.execute({ stepId: "s1", effect: "none", input: { value: 1 } }, () => ({ value: 2 }));
  const checkpoint = sandbox.checkpoint("run-3", "2026-09-01T08:33:00.000Z");

  const malformed = {
    ...checkpoint,
    receipts: [...checkpoint.receipts, { ...checkpoint.receipts[0]! }],
  };
  assert.throws(() => new DeterministicSandbox().restore(malformed));
});

test("equivalent object-key ordering produces stable hashes", () => {
  const first = new DeterministicSandbox().execute({ stepId: "a", effect: "none", input: { a: 1, b: 2 } }, (input) => input);
  const second = new DeterministicSandbox().execute({ stepId: "b", effect: "none", input: { b: 2, a: 1 } }, (input) => input);
  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.outputHash, second.outputHash);
});

test("unsupported non-JSON values fail closed", () => {
  const sandbox = new DeterministicSandbox();
  assert.throws(() => sandbox.execute({ stepId: "bad", effect: "none", input: { value: undefined } }, (input) => input));
  assert.throws(() => sandbox.execute({ stepId: "bad-number", effect: "none", input: Number.NaN }, (input) => input));
});
