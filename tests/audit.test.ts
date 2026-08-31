import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAuditEvent,
  verifyAuditChain,
  type AuditEvent,
} from "../src/audit/hash-chain.js";

test("audit chain validates when untouched", () => {
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

  assert.equal(verifyAuditChain(chain), true);
});

test("audit chain detects historical tampering", () => {
  const first = appendAuditEvent([], {
    eventId: "event-1",
    actionId: "action-1",
    timestamp: "2026-08-31T12:00:00.000Z",
    actor: "agent",
    capability: "research.public_web",
    decision: "allow",
    reason: "Original reason",
  });

  const second = appendAuditEvent([first], {
    eventId: "event-2",
    actionId: "action-2",
    timestamp: "2026-08-31T12:01:00.000Z",
    actor: "agent",
    capability: "content.draft",
    decision: "allow",
    reason: "Drafting allowed",
  });

  const tampered: AuditEvent[] = [{ ...first, reason: "Modified history" }, second];
  assert.equal(verifyAuditChain(tampered), false);
});
