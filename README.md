# Autonomous Income Agent

Owner-controlled, policy-governed autonomous AI system for discovering legitimate online opportunities, building digital products/services, and tracking revenue without impersonating the owner or bypassing platform, identity, KYC, contractual, payment, tax, or legal controls.

## Project status

**Overall completion: 100% candidate** — R0-R8 implementation and acceptance work complete on the R8 branch. Final completion is only canonical after this documentation commit passes exact-head CI and PR #11 is merged to `main`.

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
| R8 | Production readiness | 100% | Complete pending final exact-head CI + merge |

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
- [x] Loopback/private/link-local target blocking for SSRF resistance
- [x] Authorized channel registry with exact-origin capability scoping
- [x] Read-only public research and guarded publishing/customer/commerce writes
- [x] Financial and identity actions excluded from generic internet gateway
- [x] Request/response size budgets and in-memory rate limiting
- [x] Negative tests for unauthorized origins, methods, private targets and gated capabilities

### R6 — Security, identity and owner authorization
- [x] Ed25519-signed owner approval envelopes with trusted-key verification
- [x] Exact capability/action scoping, expiry enforcement and one-time nonce replay prevention
- [x] Owner kill-switch that blocks agent operation until explicitly released
- [x] Secret references that reject inline credential values
- [x] Bounded spend reservation guard for autonomous within-budget actions
- [x] Explicit AI representative identity profile that cannot claim to be a human
- [x] Security negative tests for wrong scope, expiry, replay, overspend and human impersonation

### R7 — Sandbox, end-to-end and recovery testing
- [x] Deterministic sandbox receipts for effectful execution
- [x] Stable SHA-256 input/output hashing for replay evidence
- [x] Integrity-protected recovery checkpoints
- [x] Restart restore without duplicate side-effect execution
- [x] Tamper rejection for recovery journals
- [x] Determinism tests for equivalent structured inputs

### R8 — Production readiness
- [x] Real Node HTTPS transport with TLS hostname verification
- [x] DNS resolution pinned to validated public addresses
- [x] Private/reserved/loopback/link-local SSRF defenses
- [x] Redirect denial to prevent validation bypass
- [x] Exact-origin credential bindings resolved by secret references only
- [x] Production configuration rejects owner private signing key presence
- [x] Fail-closed readiness and non-sensitive health contracts
- [x] Durable atomic recovery checkpoint persistence
- [x] Build emission included in the validation gate
- [x] `.env.example` contains references/placeholders only, no embedded credentials
- [x] Production operations runbook
- [x] Production transport/config/recovery tests
- [x] Pre-final R8 exact-head CI success: run `33497593006` on commit `88af430e84f6fc5d667bdb70e70a5f88e206eb3c`
- [ ] Final documentation exact-head CI green
- [ ] PR #11 merged to `main`

## Engineering workflow

- Feature branch -> pull request -> CI -> merge to `main`.
- CI must be green before merge.
- README progress is updated as milestones complete.
- Policy/approval gates are executable product behavior, not documentation-only rules.
- External asynchronous waits use timed follow-up checks; development otherwise continues immediately.

## License

No license has been selected yet. Until one is added, normal copyright rules apply.
