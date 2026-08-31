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

export function appendAuditEvent(chain: readonly AuditEvent[], input: AuditEventInput): AuditEvent {
  const previousHash = chain.at(-1)?.hash ?? "GENESIS";
  const hash = hashPayload(canonicalPayload(input, previousHash));
  return { ...input, previousHash, hash };
}

export function verifyAuditChain(chain: readonly AuditEvent[]): boolean {
  let expectedPrevious = "GENESIS";

  for (const event of chain) {
    if (event.previousHash !== expectedPrevious) return false;

    const { previousHash, hash, ...input } = event;
    const expectedHash = hashPayload(canonicalPayload(input, previousHash));
    if (hash !== expectedHash) return false;

    expectedPrevious = hash;
  }

  return true;
}
