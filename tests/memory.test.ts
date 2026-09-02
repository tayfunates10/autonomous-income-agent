import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore } from "../src/memory/store.js";

test("memory requires provenance and valid confidence", () => {
  const memory = new MemoryStore();

  assert.throws(() =>
    memory.upsert({
      id: "m1",
      text: "Observed market fact",
      tags: ["market"],
      confidence: 0.9,
      observedAt: "2026-08-31T12:00:00.000Z",
      sensitivity: "public",
      provenance: { sourceId: "", sourceType: "web" },
    }),
  );
});

test("memory query filters by text/tags and ranks confidence", () => {
  const memory = new MemoryStore();
  memory.upsert({
    id: "low",
    text: "Logo automation demand is growing",
    tags: ["Design", "Market"],
    confidence: 0.6,
    observedAt: "2026-08-31T12:00:00.000Z",
    sensitivity: "public",
    provenance: { sourceId: "source-low", sourceType: "web", uri: "https://example.invalid/low" },
  });
  memory.upsert({
    id: "high",
    text: "Logo automation demand has recurring buyer intent",
    tags: ["market", "design"],
    confidence: 0.95,
    observedAt: "2026-08-31T12:05:00.000Z",
    sensitivity: "public",
    provenance: { sourceId: "source-high", sourceType: "web", uri: "https://example.invalid/high" },
  });

  const results = memory.query({ text: "logo", tags: ["MARKET"], now: new Date("2026-08-31T12:10:00.000Z") });
  assert.deepEqual(results.map((entry) => entry.id), ["high", "low"]);
});

test("expired memory is hidden and can be pruned", () => {
  const memory = new MemoryStore();
  memory.upsert(
    {
      id: "expiring",
      text: "Short-lived signal",
      tags: ["signal"],
      confidence: 0.8,
      observedAt: "2026-08-31T12:00:00.000Z",
      expiresAt: "2026-08-31T12:30:00.000Z",
      sensitivity: "internal",
      provenance: { sourceId: "run-1", sourceType: "execution" },
    },
    new Date("2026-08-31T12:10:00.000Z"),
  );

  assert.equal(memory.get("expiring", new Date("2026-08-31T12:29:59.000Z"))?.id, "expiring");
  assert.equal(memory.get("expiring", new Date("2026-08-31T12:30:00.000Z")), undefined);
  assert.equal(memory.pruneExpired(new Date("2026-08-31T12:30:00.000Z")), 1);
  assert.equal(memory.size(), 0);
});

test("memory rejects entries already expired at insertion time", () => {
  const memory = new MemoryStore();
  assert.throws(
    () =>
      memory.upsert(
        {
          id: "stale",
          text: "Already stale signal",
          tags: ["signal"],
          confidence: 0.8,
          observedAt: "2026-08-31T12:00:00.000Z",
          expiresAt: "2026-08-31T12:30:00.000Z",
          sensitivity: "internal",
          provenance: { sourceId: "run-stale", sourceType: "execution" },
        },
        new Date("2026-08-31T12:30:00.000Z"),
      ),
    /future at insertion time/i,
  );
  assert.equal(memory.size(), 0);
});
