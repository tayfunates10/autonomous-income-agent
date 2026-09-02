import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAuditEvent,
  createAuditAnchor,
  verifyAuditChain,
  type AuditEvent,
} from "../src/audit/hash-chain.js";

function buildChain(): AuditEvent[] {
  const chain: AuditEvent[] = [];
  chain.push(
    appendAuditEvent(chain, {
      eventId: "event-1",
      actionId: "action-1",
      timestamp: "2026-08-31T12:00:00.000Z",
      actor: "agent",
      capability: "research.public_web",
      decision: "allow",
      reason: "Allowed by autonomous policy.",
    }),
  );
  chain.push(
    appendAuditEvent(chain, {
      eventId: "event-2",
      actionId: "action-2",
      timestamp: "2026-08-31T12:01:00.000Z",
      actor: "system",
      capability: "finance.transfer_funds",
      decision: "require_owner_approval",
      reason: "Owner approval required.",
    }),
  );
  chain.push(
    appendAuditEvent(chain, {
      eventId: "event-3",
      actionId: "action-3",
      timestamp: "2026-08-31T12:02:00.000Z",
      actor: "system",
      capability: "content.draft",
      decision: "allow",
      reason: "Draft completed.",
    }),
  );
  return chain;
}

test("audit chain validates when untouched at a trusted anchor", () => {
  const chain = buildChain();
  const anchor = createAuditAnchor(chain);
  assert.equal(verifyAuditChain(chain, anchor), true);
});

test("audit chain detects historical tampering", () => {
  const chain = buildChain();
  const anchor = createAuditAnchor(chain);
  const tampered: AuditEvent[] = [{ ...chain[0]!, reason: "Modified history" }, ...chain.slice(1)];
  assert.equal(verifyAuditChain(tampered, anchor), false);
});

test("audit anchor detects tail truncation including empty-prefix attacks", () => {
  const chain = buildChain();
  const anchor = createAuditAnchor(chain);
  assert.equal(verifyAuditChain(chain.slice(0, 2), anchor), false);
  assert.equal(verifyAuditChain(chain.slice(0, 1), anchor), false);
  assert.equal(verifyAuditChain([], anchor), false);
});

test("audit anchor detects a forged expected tail", () => {
  const chain = buildChain();
  assert.equal(verifyAuditChain(chain, { eventCount: chain.length, tailHash: "0".repeat(64) }), false);
});
