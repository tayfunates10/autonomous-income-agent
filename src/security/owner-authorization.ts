import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type { Capability } from "../policy/capabilities.js";

export interface SignedOwnerApprovalPayload {
  approvalId: string;
  capability: Capability;
  actionId: string;
  approvedBy: "owner";
  approvedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface SignedOwnerApproval {
  payload: SignedOwnerApprovalPayload;
  signatureBase64: string;
  keyId: string;
}

function canonicalPayload(payload: SignedOwnerApprovalPayload): string {
  return JSON.stringify({
    actionId: payload.actionId,
    approvalId: payload.approvalId,
    approvedAt: payload.approvedAt,
    approvedBy: payload.approvedBy,
    capability: payload.capability,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
  });
}

function validatePayload(payload: SignedOwnerApprovalPayload): void {
  if (payload.approvedBy !== "owner") throw new Error("Approval signer must be owner.");
  for (const [name, value] of Object.entries({
    approvalId: payload.approvalId,
    actionId: payload.actionId,
    nonce: payload.nonce,
  })) {
    if (value.trim().length === 0) throw new Error(`${name} cannot be empty.`);
  }
  const approvedAt = Date.parse(payload.approvedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt) || approvedAt >= expiresAt) {
    throw new Error("Approval time window is invalid.");
  }
}

export function signOwnerApproval(
  payload: SignedOwnerApprovalPayload,
  privateKeyPem: string,
  keyId: string,
): SignedOwnerApproval {
  validatePayload(payload);
  if (keyId.trim().length === 0) throw new Error("keyId cannot be empty.");
  const privateKey: KeyObject = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Owner approval key must be Ed25519.");
  const signature = sign(null, Buffer.from(canonicalPayload(payload), "utf8"), privateKey);
  return { payload: { ...payload }, signatureBase64: signature.toString("base64"), keyId };
}

export class OwnerAuthorizationVerifier {
  readonly #trustedKeys = new Map<string, KeyObject>();
  readonly #usedNonces = new Set<string>();

  trustKey(keyId: string, publicKeyPem: string): void {
    if (keyId.trim().length === 0) throw new Error("keyId cannot be empty.");
    const publicKey = createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Owner approval key must be Ed25519.");
    this.#trustedKeys.set(keyId, publicKey);
  }

  verify(
    approval: SignedOwnerApproval,
    expected: { capability: Capability; actionId: string },
    now = new Date(),
  ): boolean {
    validatePayload(approval.payload);
    if (approval.payload.capability !== expected.capability || approval.payload.actionId !== expected.actionId) return false;
    const current = now.getTime();
    const approvedAt = Date.parse(approval.payload.approvedAt);
    const expiresAt = Date.parse(approval.payload.expiresAt);
    if (approvedAt > current || current >= expiresAt) return false;
    if (this.#usedNonces.has(approval.payload.nonce)) return false;
    const key = this.#trustedKeys.get(approval.keyId);
    if (!key) return false;
    const valid = verify(
      null,
      Buffer.from(canonicalPayload(approval.payload), "utf8"),
      key,
      Buffer.from(approval.signatureBase64, "base64"),
    );
    if (valid) this.#usedNonces.add(approval.payload.nonce);
    return valid;
  }
}
