import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ALLOCATION_POLICY, RevenueLedger } from "../src/revenue/ledger.js";

test("ledger calculates net revenue and exact integer allocation", () => {
  const ledger = new RevenueLedger();
  ledger.add({
    entryId: "rev-1",
    type: "revenue",
    amountMinor: 11002,
    currency: "TRY",
    category: "sale",
    sourceId: "order-1",
    occurredAt: "2026-08-31T12:00:00.000Z",
  });
  ledger.add({
    entryId: "cost-1",
    type: "cost",
    amountMinor: 1001,
    currency: "TRY",
    category: "api",
    sourceId: "provider-1",
    occurredAt: "2026-08-31T12:01:00.000Z",
  });

  const summary = ledger.summary("TRY");
  assert.equal(summary.netMinor, 10001);

  const allocation = ledger.allocateNet("TRY", DEFAULT_ALLOCATION_POLICY);
  assert.equal(allocation.ownerMinor + allocation.operationsMinor + allocation.reinvestmentMinor, 10001);
  assert.deepEqual(allocation, {
    currency: "TRY",
    ownerMinor: 8001,
    operationsMinor: 1500,
    reinvestmentMinor: 500,
    deficitMinor: 0,
  });
});

test("ledger records deficits without allocating nonexistent profit", () => {
  const ledger = new RevenueLedger();
  ledger.add({
    entryId: "cost-only",
    type: "cost",
    amountMinor: 2500,
    currency: "USD",
    category: "hosting",
    sourceId: "host-1",
    occurredAt: "2026-08-31T12:00:00.000Z",
  });

  assert.deepEqual(ledger.allocateNet("USD", DEFAULT_ALLOCATION_POLICY), {
    currency: "USD",
    ownerMinor: 0,
    operationsMinor: 0,
    reinvestmentMinor: 0,
    deficitMinor: 2500,
  });
});

test("ledger rejects duplicate IDs and invalid allocation totals", () => {
  const ledger = new RevenueLedger();
  const entry = {
    entryId: "same",
    type: "revenue" as const,
    amountMinor: 100,
    currency: "EUR",
    category: "sale",
    sourceId: "order",
    occurredAt: "2026-08-31T12:00:00.000Z",
  };
  ledger.add(entry);
  assert.throws(() => ledger.add(entry));
  assert.throws(() =>
    ledger.allocateNet("EUR", { ownerShare: 0.8, operationsShare: 0.3, reinvestmentShare: 0.1 }),
  );
});
