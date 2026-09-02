# Security Model

## Trust boundary

The human owner is the ultimate authority for identity, legal commitments and high-impact financial operations. The agent may act autonomously only inside capabilities explicitly classified as autonomous and inside configured account/channel/budget scopes.

## Never-autonomous actions

These require owner authorization or are permanently prohibited by policy:

- Government identity/KYC submission: explicit owner approval and a human-controlled verification step.
- Contracts and other legally binding commitments: explicit owner approval.
- Bank/payment account creation, withdrawals, transfers, payout destination changes, borrowing or credit: explicit owner approval.
- Identity/document forgery, pretending to be an unaffiliated human, credential theft/exfiltration, or bypassing platform controls: permanently denied.

## Signed owner approvals

Owner-gated runtime execution accepts only an Ed25519-signed approval envelope. The signed payload is scoped to:

- a unique `approvalId`,
- one capability,
- one `actionId`,
- the owner as approver,
- an approval timestamp,
- an expiration timestamp,
- a one-time nonce.

The envelope also carries a trusted `keyId` and the Ed25519 signature. `AgentRuntime` passes owner-gated requests through `OwnerAuthorizationVerifier`; unsigned structural objects, unknown keys, wrong scopes, expired approvals, invalid signatures and reused nonces fail closed. A grant for one action never authorizes another action.

## Owner kill-switch

`AgentRuntime` enforces `AgentKillSwitch` at the beginning of execution. When engaged, the executor is not invoked and the blocked task is recorded as a deny decision in the audit chain. Operation resumes only after the owner-controlled switch is explicitly released.

## Budget escalation

Autonomous spending is allowed only inside the configured budget envelope. An over-budget spend remains blocked unless a valid signed owner approval is verified for that exact action. Permanent-deny capabilities remain denied even if an approval is present.

## Secrets

Secrets are never committed to Git. Runtime integrations use secret references resolved by the deployment environment or secret-management boundary. Environment references must be identifier-shaped; inline credential values are rejected before resolution.

## Internet and SSRF boundary

The integration and production transport layers share public-network address classification. HTTPS, exact-origin channel/egress authorization, DNS pinning, redirect denial and public-address validation are enforced. Loopback, private, link-local, reserved, IPv6 ULA/site-local and IPv4-mapped private targets fail closed. Rejected unauthorized requests do not consume the transport rate budget.

## Recovery and idempotency

Effectful sandbox steps use deterministic SHA-256 replay evidence and integrity-protected checkpoints. `Date` values are encoded explicitly, unsupported structured types such as `Map`/`Set` fail closed, and optional undefined object fields are omitted deterministically. Reusing a completed step ID with a different effect or input is rejected as an idempotency conflict.

## Audit

Material execution decisions are represented as hash-chained audit events. Runtime-injected clocks are also used for audit timestamps so deterministic replay does not record a conflicting wall-clock time. The in-process chain is tamper-evident; production deployments should additionally retain audit/checkpoint material in durable protected storage.

## Implemented hardening

- default-deny capability policy and permanent-deny classes,
- Ed25519-signed owner approvals with trusted-key verification,
- exact capability/action scoping, expiry checks and one-time nonce replay prevention,
- runtime-enforced owner kill-switch,
- spend budget guard plus signed owner escalation for over-budget actions,
- secret-reference validation,
- integration SSRF and rate-budget protections,
- production DNS pinning, exact-origin egress and redirect denial,
- deterministic recovery/idempotency evidence,
- negative integration tests that exercise the actual runtime/gateway enforcement paths.
