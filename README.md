# Autonomous Income Agent

Owner-controlled, policy-governed autonomous AI system for discovering legitimate online opportunities, building digital products/services, and tracking revenue without impersonating the owner or bypassing platform, identity, KYC, contractual, payment, tax, or legal controls.

## Project status

**Overall completion: 96%** — R0-R7 complete; R8 production readiness is next.

| Release | Scope | Target | Status |
|---|---|---:|---|
| R0 | Foundation, policy model, approval gate, audit contract, CI | 10% | Complete |
| R1 | Agent brain & task runtime | 25% | Complete |
| R2 | Planner, memory & evaluator | 40% | Complete |
| R3 | Opportunity discovery & scoring | 55% | Complete |
| R4 | Product/content/service/revenue engines | 70% | Complete |
| R5 | Safe internet integrations | 82% | Complete |
| R6 | Security, identity & owner authorization hardening | 90% | Complete |
| R7 | Sandbox/e2e/recovery testing | 96% | Complete |
| R8 | Production readiness | 100% | Planned |

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
- [x] Evidence-backed opportunity model and risk-adjusted scoring
- [x] Pursue / validate / discard decisions with hard risk ceilings
- [x] Provenance-preserving ingestion and bounded validation plans

### R4 — Business engines
- [x] Product/content/service engines with evidence and owner-gated legal steps
- [x] Multi-currency revenue/cost/refund ledger and exact profit allocations

### R5 — Safe internet integrations
- [x] HTTPS-only, SSRF-resistant public-web gateway
- [x] Exact-origin authorized channels for publishing/customer/commerce writes
- [x] Financial/identity actions excluded from generic internet gateway
- [x] Payload and request-rate budgets with negative tests

### R6 — Security hardening
- [x] Ed25519-verifiable owner approvals scoped to action/capability/agent
- [x] One-time nonce replay protection and approval expiry validation
- [x] Integrated kill-switch security control plane
- [x] Time/currency/amount-scoped operational budget envelopes
- [x] Secret-reference/provider boundary with no source-controlled credentials
- [x] Transparent `authorized_ai_representative` identity profile
- [x] Tampering, replay, wrong-agent, budget and kill-switch tests

### R7 — Sandbox, E2E and recovery
- [x] Deterministic sandbox transport with transient/permanent fault injection
- [x] Full opportunity -> product -> offer -> retry -> revenue sandbox flow
- [x] Runtime snapshot contract with verified audit-chain restore
- [x] Completed action replay protection survives process restart
- [x] Tampered recovery snapshots fail closed
- [x] Recovery and restart guarantees documented

## Engineering workflow

- Feature branch -> pull request -> CI -> merge to `main`.
- CI must be green before merge.
- README progress is updated as milestones complete.
- Policy/approval gates are executable product behavior, not documentation-only rules.
- External asynchronous waits use timed follow-up checks; development otherwise continues immediately.

## License

No license has been selected yet. Until one is added, normal copyright rules apply.
