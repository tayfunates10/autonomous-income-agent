# Autonomous Income Agent

Owner-controlled, policy-governed autonomous AI system for discovering legitimate online opportunities, building digital products/services, and tracking revenue without impersonating the owner or bypassing platform, identity, KYC, contractual, payment, tax, or legal controls.

## Project status

**Overall completion: 100%** — R0-R8 are merged to `main`; the production-readiness acceptance gate passed on the exact R8 head before merge. The subsequent UAT audit identified 14 enforcement-integration and hardening findings; F-01 through F-14 and the Section 5 negative-integration/documentation coverage gap have now been remediated through dedicated CI-validated UAT PRs.

| Release | Scope | Target | Status |
|---|---|---:|---|
| R0 | Foundation, policy model, approval gate, audit contract, CI | 10% | Complete |
| R1 | Agent brain & task runtime | 25% | Complete |
| R2 | Planner, memory & evaluator | 40% | Complete |
| R3 | Opportunity discovery & scoring | 55% | Complete |
| R4 | Product/content/service engines | 70% | Complete |
| R5 | Safe internet integrations | 82% | Complete |
| R6 | Security, identity & owner authorization hardening | 90% | Complete |
| R7 | Sandbox/e2e/recovery testing | 96% | Complete |
| R8 | Production readiness | 100% | Complete |

## Non-negotiable operating rules

1. The agent is an **authorized AI representative**, not a fake human identity.
2. It must never forge, fabricate, alter, or autonomously submit government IDs or KYC evidence.
3. Legally binding contracts, account ownership changes, loans/credit, bank/payment onboarding, withdrawals/transfers, and other high-impact financial actions require explicit owner approval.
4. The agent may research, draft, code, publish where authorized, optimize, support customers, and operate approved business workflows autonomously within configured limits.
5. Every material decision must be auditable: input context, policy decision, requested capability, result, and actor/approval state.
6. Credentials and secrets never belong in source control.
7. Revenue is owned by the owner/business entity; internal AI budget shares are accounting allocations, not independent legal ownership by the AI.

## Core loop

```text
Discover -> Evaluate -> Policy Check -> Plan -> Execute Allowed Work
       -> Approval Gate (when required) -> Verify -> Ledger -> Learn
```

## Completed releases

### R0 — Foundation
- [x] Typed capability model and default-deny policy engine
- [x] Scoped owner approval gate
- [x] Tamper-evident audit contract
- [x] Security/architecture docs and CI

### R1 — Agent runtime
- [x] Typed task/result state model and executor registry
- [x] Policy/approval enforcement before execution
- [x] Replay protection, retries and cancellation
- [x] Runtime audit integration and tests

### R2 — Planner, memory, evaluator
- [x] Bounded DAG planner, dependency validation and policy annotation
- [x] Provenance-aware memory with confidence/tags/expiry
- [x] Deterministic weighted evaluator with hard minimums
- [x] Planner/memory/evaluator tests and docs

### R3 — Opportunity engine
- [x] Evidence-backed opportunity model
- [x] Risk-adjusted scoring and hard risk ceilings
- [x] Pursue / validate / discard decisions
- [x] Provenance-preserving memory ingestion
- [x] Bounded validation-plan generation
- [x] Opportunity tests and documentation
- [x] CI green

### R4 — Business engines
- [x] Product blueprints only from pursued, evidence-backed opportunities
- [x] Evidence-grounded content drafting with unavailable-evidence rejection
- [x] Service offer/delivery planning with contract step behind owner approval
- [x] Multi-currency revenue/cost/refund ledger
- [x] Exact integer net-profit allocation with owner/operations/reinvestment accounting shares
- [x] Duplicate/invalid ledger and allocation-policy validation tests

### R5 — Safe internet integrations
- [x] HTTPS-only public-web gateway with credential-in-URL rejection
- [x] Shared IPv4/IPv6 public-address classification for SSRF resistance
- [x] Authorized channel registry with exact-origin capability scoping
- [x] Read-only public research and guarded publishing/customer/commerce writes
- [x] Financial and identity actions excluded from generic internet gateway
- [x] Request/response size budgets and in-memory rate limiting
- [x] Rejected unauthorized requests do not consume legitimate rate budget
- [x] Negative tests for unauthorized origins, methods, IPv4/IPv6 private targets and gated capabilities

### R6 — Security, identity and owner authorization
- [x] Ed25519-signed owner approval envelopes with trusted-key verification
- [x] `AgentRuntime` enforcement of signed approvals for owner-gated capabilities
- [x] Exact capability/action scoping, expiry enforcement and one-time nonce replay prevention
- [x] Runtime-enforced owner kill-switch with deny audit records
- [x] Secret references that reject inline credential values
- [x] Bounded spend reservation guard and signed owner escalation for over-budget actions
- [x] Explicit AI representative identity profile that cannot claim to be a human
- [x] Negative integration tests for forged approvals, kill-switch, wrong scope, expiry, replay, overspend and human impersonation

### R7 — Sandbox, end-to-end and recovery testing
- [x] Deterministic sandbox receipts for effectful execution
- [x] Stable SHA-256 input/output hashing for replay evidence, including explicit `Date` encoding
- [x] Unsupported non-plain structured values fail closed
- [x] Integrity-protected recovery checkpoints
- [x] Restart restore without duplicate side-effect execution
- [x] Tamper rejection for recovery journals
- [x] Determinism tests for equivalent structured inputs and idempotency conflicts

### R8 — Production readiness
- [x] Real Node HTTPS transport with TLS hostname verification
- [x] DNS resolution pinned to validated public addresses
- [x] Private/reserved/loopback/link-local/site-local SSRF defenses
- [x] Exact-origin egress allowlist enforcement
- [x] Redirect denial to prevent validation bypass
- [x] Exact-origin credential bindings resolved by secret references only
- [x] Production configuration rejects owner private signing key presence
- [x] Readiness parses and requires a valid Ed25519 owner public key
- [x] Escaped `\n` PEM environment values are normalized before readiness validation
- [x] DNS resolution is bounded by the configured request timeout
- [x] Fail-closed readiness and non-sensitive health contracts
- [x] Durable atomic recovery checkpoint persistence
- [x] Production and recovery surfaces are exported from the package entry point
- [x] Build emission included in the validation gate
- [x] `.env.example` contains references/placeholders only, no embedded credentials
- [x] Production operations runbook
- [x] Production transport/config/recovery tests
- [x] Final R8 exact-head CI success: run `33507239528` on commit `0c3cb25d25da12d33e55adef63e8c383d7eeb898`
- [x] Four production review findings closed before merge: egress allowlist, IPv6 site-local blocking, Ed25519 readiness validation, DNS timeout coverage
- [x] PR #11 merged to `main`: `a05eb70bccf0784c092e8cee47ecf86ecdde2979`

## UAT remediation

The post-release UAT report identified 14 findings. The remediation sequence preserves all security gates and adds enforcement-path regression tests rather than relying only on isolated unit tests.

- [x] F-01–F-04: signed approval enforcement, runtime kill-switch, over-budget owner escalation, deterministic sandbox hashing
- [x] F-05–F-08: IPv6 SSRF consistency, PEM normalization, public API exports, rate-budget ordering
- [x] F-09–F-13: deterministic audit timestamps, planner limit validation, secret-reference hardening, optional undefined hashing behavior, expired-memory rejection
- [x] F-14 and final consolidated negative integration/documentation acceptance
- [x] UAT remediation PR chain #14, #15, #16 and #17 merged to `main` with exact-head CI success before each merge

## Engineering workflow

- Feature branch -> pull request -> CI -> merge to `main`.
- CI must be green before merge.
- README progress is updated as milestones complete.
- Policy/approval gates are executable product behavior, not documentation-only rules.
- External asynchronous waits use timed follow-up checks; development otherwise continues immediately.

## License

No license has been selected yet. Until one is added, normal copyright rules apply.
