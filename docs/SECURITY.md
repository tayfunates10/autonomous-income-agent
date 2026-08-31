# Security Model

## Trust boundary

The human owner is the ultimate authority for identity, legal commitments and high-impact financial operations. The agent may act autonomously only inside capabilities explicitly classified as autonomous and inside configured account/channel/budget scopes.

## Never-autonomous actions

These require owner authorization or are permanently prohibited by policy:

- Government identity/KYC submission: explicit owner approval and a human-controlled verification step.
- Contracts and other legally binding commitments: explicit owner approval.
- Bank/payment account creation, withdrawals, transfers, payout destination changes, borrowing or credit: explicit owner approval.
- Identity/document forgery, pretending to be an unaffiliated human, credential theft/exfiltration, or bypassing platform controls: permanently denied.

## Approval grants

An approval grant must be scoped to:

- a unique `approvalId`,
- one capability,
- one `actionId`,
- the owner as approver,
- an approval timestamp,
- an expiration timestamp.

A grant for one action must never authorize another action. Expired grants fail closed.

## Secrets

Secrets are never committed to Git. Future integrations must consume runtime-injected credentials from a secret manager or deployment environment with least privilege and rotation support.

## Audit

Material execution decisions are represented as hash-chained audit events. This is tamper-evident, not a substitute for a production append-only storage service. A later release will persist signed audit checkpoints outside the application process.

## Threats addressed in R0

- capability escalation,
- stale or replayed owner approvals,
- approval reuse against a different action,
- accidental autonomous high-impact financial/legal activity,
- history modification after execution,
- accidental credential commits through ignore rules.

## Future hardening

R6 will add signed approval tokens, replay protection, durable append-only audit storage, secret-manager adapters, per-integration permission manifests, rate/budget circuit breakers, incident shutdown controls, and recovery procedures.
