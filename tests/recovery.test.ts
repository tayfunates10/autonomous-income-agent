import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicSandbox } from "../src/recovery/sandbox.js";

test("sandbox prevents duplicate execution after recovery", () => {
  const sandbox = new DeterministicSandbox();
  let executions = 0;
  const receipt = sandbox.execute({ stepId: "publish-1", effect: "network", input: { draft: "hello" } }, (input) => {
    executions += 1;
    return { ok: true, input };
  });
  const checkpoint = sandbox.checkpoint("run-1", "2026-09-01T08:30:00.000Z");

  const recovered = new DeterministicSandbox();
  recovered.restore(checkpoint);
  const replayed = recovered.execute({ stepId: "publish-1", effect: "network", input: { draft: "changed" } }, () => {
    executions += 1;
    return { ok: false };
  });

  assert.equal(executions, 1);
  assert.deepEqual(replayed, receipt);
  assert.equal(recovered.receipts().length, 1);
});

test("checkpoint tampering is rejected", () => {
  const sandbox = new DeterministicSandbox();
  sandbox.execute({ stepId: "s1", effect: "none", input: { value: 1 } }, () => ({ value: 2 }));
  const checkpoint = sandbox.checkpoint("run-2", "2026-09-01T08:31:00.000Z");

  const tampered = {
    ...checkpoint,
    receipts: [{ ...checkpoint.receipts[0]!, outputHash: "0".repeat(64) }],
  };
  assert.throws(() => new DeterministicSandbox().restore(tampered), /integrity/i);
});

test("equivalent object-key ordering produces stable hashes", () => {
  const first = new DeterministicSandbox().execute({ stepId: "a", effect: "none", input: { a: 1, b: 2 } }, (input) => input);
  const second = new DeterministicSandbox().execute({ stepId: "b", effect: "none", input: { b: 2, a: 1 } }, (input) => input);
  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.outputHash, second.outputHash);
});
