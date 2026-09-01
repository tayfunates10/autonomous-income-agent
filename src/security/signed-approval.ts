import { createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyLike, type KeyObject } from "node:crypto";
import type { OwnerApprovalGrant } from "../approval/gate.js";
import type { Capability } from "../policy/capabilities.js";
import { NonceStore } from "./nonce-store.js";

export interface SignedApprovalPayload extends OwnerApprovalGrant {
  nonce: string;
  issuedForAgentId: string;
}

export interface SignedOwnerApproval {
  keyId: string;
  payload: SignedApprovalPayload;
  signature: string;
}

export interface ApprovalVerificationExpectation {
  actionId: string;
  capability: Capability;
  agentId: string;
  now?: Date;
}

function canonicalPayload(payload: SignedApprovalPayload): string {
  return JSON.stringify({
    approvalId: payload.approvalId,
    capability: payload.capability,
    actionId: payload.actionId,
    approvedBy: payload.approvedBy,
    approvedAt: payload.approvedAt,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
    issuedForAgentId: payload.issuedForAgentId,
  });
}

export class OwnerPublicKeyRegistry {
  readonly #keys = new Map<string, KeyObject>();

  register(keyId: string, publicKey: KeyLike): void {
    if (keyId.trim().length === 0) throw new Error("keyId cannot be empty.");
    this.#keys.set(keyId, createPublicKey(publicKey));
  }

  get(keyId: string): KeyObject | undefined {
    return this.#keys.get(keyId);
  }
}

export function signOwnerApproval(
  payload: SignedApprovalPayload,
  keyId: string,
  privateKey: KeyLike,
): SignedOwnerApproval {
  if (keyId.trim().length === 0) throw new Error("keyId cannot be empty.");
  const signature = cryptoSign(null, Buffer.from(canonicalPayload(payload), "utf8"), privateKey).toString("base64url");
  return { keyId, payload: { ...payload }, signature };
}

export function verifyOwnerApproval(
  signed: SignedOwnerApproval,
  keys: OwnerPublicKeyRegistry,
  nonces: NonceStore,
  expected: ApprovalVerificationExpectation,
): OwnerApprovalGrant {
  const key = keys.get(signed.keyId);
  if (!key) throw new Error("Owner approval signing key is not trusted.");
  if (signed.payload.approvedBy !== "owner") throw new Error("Approval signer role is invalid.");
  if (signed.payload.actionId !== expected.actionId) throw new Error("Approval action scope does not match.");
  if (signed.payload.capability !== expected.capability) throw new Error("Approval capability scope does not match.");
  if (signed.payload.issuedForAgentId !== expected.agentId) throw new Error("Approval agent scope does not match.");

  const now = (expected.now ?? new Date()).getTime();
  const approvedAt = Date.parse(signed.payload.approvedAt);
  const expiresAt = Date.parse(signed.payload.expiresAt);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)) throw new Error("Approval timestamps are invalid.");
  if (approvedAt > now || now >= expiresAt) throw new Error("Approval is not currently valid.");

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signed.signature, "base64url");
  } catch {
    throw new Error("Owner approval signature encoding is invalid.");
  }

  const validSignature = cryptoVerify(
    null,
    Buffer.from(canonicalPayload(signed.payload), "utf8"),
    key,
    signatureBytes,
  );
  if (!validSignature) throw new Error("Owner approval signature verification failed.");

  nonces.consume(signed.payload.nonce);

  return {
    approvalId: signed.payload.approvalId,
    capability: signed.payload.capability,
    actionId: signed.payload.actionId,
    approvedBy: "owner",
    approvedAt: signed.payload.approvedAt,
    expiresAt: signed.payload.expiresAt,
  };
}
