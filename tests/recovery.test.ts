import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicSandbox } from "../src/recovery/sandbox.js";

test("sandbox prevents duplicate execution after recovery for identical input", async () => {
  const sandbox = new DeterministicSandbox();
  let executions = 0;
  const step = { stepId: "publish-1", effect: "network" as const, input: { draft: "hello" } };
  const receipt = await sandbox.execute(step, async (input) => {
    executions += 1;
    return { ok: true, input };
  });
  const checkpoint = sandbox.checkpoint("run-1", "2026-09-01T08:30:00.000Z");

  const recovered = new DeterministicSandbox();
  recovered.restore(checkpoint);
  const replayed = await recovered.execute(step, async () => {
    executions += 1;
    return { ok: false };
  });

  assert.equal(executions, 1);
  assert.deepEqual(replayed, receipt);
  assert.equal(recovered.receipts().length, 1);
});

test("sandbox rejects reused completed stepId when input or effect changes", async () => {
  const sandbox = new DeterministicSandbox();
  await sandbox.execute({ stepId: "publish-1", effect: "network", input: { draft: "hello" } }, async (input) => input);
  const checkpoint = sandbox.checkpoint("run-conflict", "2026-09-01T08:30:00.000Z");
  const recovered = new DeterministicSandbox();
  recovered.restore(checkpoint);

  await assert.rejects(() => recovered.execute(
    { stepId: "publish-1", effect: "network", input: { draft: "changed" } },
    async () => ({ ok: false }),
  ), /idempotency conflict/i);
  await assert.rejects(() => recovered.execute(
    { stepId: "publish-1", effect: "filesystem", input: { draft: "hello" } },
    async () => ({ ok: false }),
  ), /idempotency conflict/i);
});

test("async sandbox waits for effect completion before writing completed receipt", async () => {
  const sandbox = new DeterministicSandbox();
  let charged = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending = sandbox.execute(
    { stepId: "charge", effect: "network", input: { amountMinor: 100 } },
    async () => {
      await gate;
      charged = 100;
      return { chargeId: "ch-1", amountMinor: charged };
    },
  );

  assert.equal(charged, 0);
  assert.equal(sandbox.receipts().length, 0);
  release();
  const receipt = await pending;
  assert.equal(charged, 100);
  assert.equal(receipt.status, "completed");
  assert.equal(sandbox.receipts().length, 1);
});

test("rejected async effect records failed receipt without unhandled rejection semantics", async () => {
  const sandbox = new DeterministicSandbox();
  const receipt = await sandbox.execute(
    { stepId: "declined", effect: "network", input: { amountMinor: 999 } },
    async () => { throw new Error("payment declined"); },
  );

  assert.equal(receipt.status, "failed");
  assert.equal(receipt.error, "payment declined");
  const checkpoint = sandbox.checkpoint("run-failed", "2026-09-01T08:30:00.000Z");
  const recovered = new DeterministicSandbox();
  recovered.restore(checkpoint);
  let retries = 0;
  const retried = await recovered.execute(
    { stepId: "declined", effect: "network", input: { amountMinor: 999 } },
    async () => { retries += 1; return { ok: true }; },
  );
  assert.equal(retries, 1);
  assert.equal(retried.status, "completed");
});

test("distinct async outputs produce distinct hashes", async () => {
  const sandbox = new DeterministicSandbox();
  const first = await sandbox.execute(
    { stepId: "a", effect: "network", input: {} },
    async () => ({ chargeId: "ch_AAA", amount: 100 }),
  );
  const second = await sandbox.execute(
    { stepId: "b", effect: "network", input: {} },
    async () => ({ chargeId: "ch_BBB", amount: 999999 }),
  );
  assert.notEqual(first.outputHash, second.outputHash);
});

test("Date values have type-aware hashes and changed dates trigger idempotency conflict", async () => {
  const sandbox = new DeterministicSandbox();
  const first = await sandbox.execute(
    { stepId: "settle", effect: "network", input: { settleAt: new Date("2026-09-01T00:00:00.000Z") } },
    async (input) => ({ ok: true, input }),
  );
  const plain = await new DeterministicSandbox().execute(
    { stepId: "plain", effect: "none", input: { settleAt: {} } },
    async (input) => input,
  );

  assert.notEqual(first.inputHash, plain.inputHash);
  await assert.rejects(() => sandbox.execute(
    { stepId: "settle", effect: "network", input: { settleAt: new Date("2030-12-31T00:00:00.000Z") } },
    async () => ({ ok: false }),
  ), /idempotency conflict/i);
});

test("Map and Set inputs fail closed instead of collapsing to plain objects", async () => {
  const sandbox = new DeterministicSandbox();
  await assert.rejects(() => sandbox.execute(
    { stepId: "map", effect: "none", input: { value: new Map([["secret", "value"]]) } },
    async (input) => input,
  ), /unsupported sandbox object type/i);
  await assert.rejects(() => sandbox.execute(
    { stepId: "set", effect: "none", input: { value: new Set([1, 2, 3]) } },
    async (input) => input,
  ), /unsupported sandbox object type/i);
});

test("checkpoint receipt or metadata tampering is rejected", async () => {
  const sandbox = new DeterministicSandbox();
  await sandbox.execute({ stepId: "s1", effect: "none", input: { value: 1 } }, async () => ({ value: 2 }));
  const checkpoint = sandbox.checkpoint("run-2", "2026-09-01T08:31:00.000Z");

  const tamperedReceipt = {
    ...checkpoint,
    receipts: [{ ...checkpoint.receipts[0]!, outputHash: "0".repeat(64) }],
  };
  assert.throws(() => new DeterministicSandbox().restore(tamperedReceipt), /integrity/i);

  const tamperedTimestamp = { ...checkpoint, createdAt: "2026-09-01T08:32:00.000Z" };
  assert.throws(() => new DeterministicSandbox().restore(tamperedTimestamp), /integrity/i);
});

test("recovery checkpoint rejects duplicate completed receipt step IDs", async () => {
  const sandbox = new DeterministicSandbox();
  await sandbox.execute({ stepId: "s1", effect: "none", input: { value: 1 } }, async () => ({ value: 2 }));
  const checkpoint = sandbox.checkpoint("run-3", "2026-09-01T08:33:00.000Z");

  const malformed = {
    ...checkpoint,
    receipts: [...checkpoint.receipts, { ...checkpoint.receipts[0]! }],
  };
  assert.throws(() => new DeterministicSandbox().restore(malformed));
});

test("equivalent object-key ordering produces stable hashes", async () => {
  const first = await new DeterministicSandbox().execute({ stepId: "a", effect: "none", input: { a: 1, b: 2 } }, async (input) => input);
  const second = await new DeterministicSandbox().execute({ stepId: "b", effect: "none", input: { b: 2, a: 1 } }, async (input) => input);
  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.outputHash, second.outputHash);
});

test("undefined optional object fields follow JSON omission semantics", async () => {
  const first = await new DeterministicSandbox().execute(
    { stepId: "optional-1", effect: "none", input: { a: 1, uri: undefined } },
    async (input) => input,
  );
  const second = await new DeterministicSandbox().execute(
    { stepId: "optional-2", effect: "none", input: { a: 1 } },
    async (input) => input,
  );
  assert.equal(first.inputHash, second.inputHash);
});

test("unsupported non-JSON scalar values fail closed", async () => {
  const sandbox = new DeterministicSandbox();
  await assert.rejects(() => sandbox.execute({ stepId: "bad-number", effect: "none", input: Number.NaN }, async (input) => input));
  await assert.rejects(() => sandbox.execute({ stepId: "bad-symbol", effect: "none", input: Symbol("x") }, async (input) => input));
});
