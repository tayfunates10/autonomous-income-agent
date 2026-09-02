import { createHash } from "node:crypto";
import type { Capability } from "../policy/capabilities.js";
import type { PolicyDecision } from "../policy/engine.js";

export interface AuditEventInput {
  eventId: string;
  actionId: string;
  timestamp: string;
  actor: "agent" | "owner" | "system";
  capability: Capability;
  decision: PolicyDecision;
  reason: string;
  approvalId?: string;
}

export interface AuditEvent extends AuditEventInput {
  previousHash: string;
  hash: string;
}

export interface AuditAnchor {
  eventCount: number;
  tailHash: string;
}

export interface AuditWindow {
  base: AuditAnchor;
  head: AuditAnchor;
  events: readonly AuditEvent[];
}

function canonicalPayload(event: AuditEventInput, previousHash: string): string {
  return JSON.stringify({
    eventId: event.eventId,
    actionId: event.actionId,
    timestamp: event.timestamp,
    actor: event.actor,
    capability: event.capability,
    decision: event.decision,
    reason: event.reason,
    approvalId: event.approvalId ?? null,
    previousHash,
  });
}

function hashPayload(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function validAnchor(anchor: AuditAnchor): boolean {
  return Number.isSafeInteger(anchor.eventCount)
    && anchor.eventCount >= 0
    && (anchor.tailHash === "GENESIS" || /^[a-f0-9]{64}$/.test(anchor.tailHash));
}

export function appendAuditEvent(
  chain: readonly AuditEvent[],
  input: AuditEventInput,
  baseTailHash = "GENESIS",
): AuditEvent {
  if (chain.length === 0 && baseTailHash !== "GENESIS" && !/^[a-f0-9]{64}$/.test(baseTailHash)) {
    throw new Error("Audit base tail hash is invalid.");
  }
  const previousHash = chain.at(-1)?.hash ?? baseTailHash;
  const hash = hashPayload(canonicalPayload(input, previousHash));
  return { ...input, previousHash, hash };
}

export function createAuditAnchor(chain: readonly AuditEvent[]): AuditAnchor {
  return {
    eventCount: chain.length,
    tailHash: chain.at(-1)?.hash ?? "GENESIS",
  };
}

export function verifyAuditSegment(
  events: readonly AuditEvent[],
  base: AuditAnchor,
  expected: AuditAnchor,
): boolean {
  if (!validAnchor(base) || !validAnchor(expected)) return false;
  if (expected.eventCount < base.eventCount) return false;
  if (events.length !== expected.eventCount - base.eventCount) return false;
  if (base.eventCount === 0 && base.tailHash !== "GENESIS") return false;

  let expectedPrevious = base.tailHash;
  for (const event of events) {
    if (event.previousHash !== expectedPrevious) return false;

    const { previousHash, hash, ...input } = event;
    const expectedHash = hashPayload(canonicalPayload(input, previousHash));
    if (hash !== expectedHash) return false;
    expectedPrevious = hash;
  }

  return expectedPrevious === expected.tailHash;
}

export function verifyAuditChain(chain: readonly AuditEvent[], expected: AuditAnchor): boolean {
  return verifyAuditSegment(chain, { eventCount: 0, tailHash: "GENESIS" }, expected);
}
